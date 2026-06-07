import OpenAI from 'openai'
import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getApiKey, getModel, getDefaultTeachingMode, getVisionConfig } from './settings.service'
import { runSql, queryOne, queryAll } from '../db'
import {
  TEACHING_PROMPTS,
  QUIZ_SYSTEM_PROMPT,
  GRADE_SYSTEM_PROMPT,
  WEAK_POINTS_SYSTEM_PROMPT,
  buildExplainUserMessage,
  buildImageUserMessage,
  truncateContent,
  parseJsonFromResponse,
} from './prompts'
import type {
  ExplainRequest,
  ImageExplainRequest,
  GenerateQuizRequest,
  GradeQuizRequest,
  AnalyzeWeakPointsRequest,
  QuizQuestion,
  Quiz,
  WeakPoint,
  TeachingMode,
} from '../../src/types'

function createClient(): OpenAI {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('请先在设置中配置 DeepSeek API Key')
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  })
}

function createVisionClient(): { client: OpenAI; model: string } {
  const { apiKey, baseURL, model } = getVisionConfig()
  if (!apiKey) {
    throw new Error('请先在设置中配置「视觉模型」API Key（用于图片解释）')
  }
  return { client: new OpenAI({ apiKey, baseURL }), model }
}

export async function testVision(): Promise<{ ok: boolean; message: string }> {
  try {
    const { client, model } = createVisionClient()
    await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    })
    return { ok: true, message: '连接成功' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : '连接失败' }
  }
}

export async function explainImageStream(req: ImageExplainRequest, win: BrowserWindow): Promise<void> {
  const { client, model } = createVisionClient()
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: TEACHING_PROMPTS[req.teachingMode] },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildImageUserMessage(req) },
          { type: 'image_url', image_url: { url: req.imageDataUrl } },
        ],
      },
    ],
    temperature: 0.7,
    stream: true,
  })

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || ''
    if (content) {
      win.webContents.send('ai:explain-chunk', content)
    }
  }
  win.webContents.send('ai:explain-done')
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const client = createClient()
    await client.chat.completions.create({
      model: getModel(),
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    })
    return { ok: true, message: '连接成功' }
  } catch (err) {
    const message = err instanceof Error ? err.message : '连接失败'
    return { ok: false, message }
  }
}

export async function explainText(req: ExplainRequest): Promise<string> {
  const client = createClient()
  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: 'system', content: TEACHING_PROMPTS[req.teachingMode] },
      { role: 'user', content: buildExplainUserMessage(req) },
    ],
    temperature: 0.7,
  })
  return response.choices[0]?.message?.content || '无法生成解释'
}

export async function explainTextStream(req: ExplainRequest, win: BrowserWindow): Promise<void> {
  const client = createClient()
  const stream = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: 'system', content: TEACHING_PROMPTS[req.teachingMode] },
      { role: 'user', content: buildExplainUserMessage(req) },
    ],
    temperature: 0.7,
    stream: true,
  })

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || ''
    if (content) {
      win.webContents.send('ai:explain-chunk', content)
    }
  }
  win.webContents.send('ai:explain-done')
}

export async function generateQuiz(req: GenerateQuizRequest): Promise<Quiz> {
  const existing = queryOne<{
    id: string
    chapter_id: string
    questions_json: string
    created_at: string
  }>('SELECT * FROM quizzes WHERE chapter_id = ?', [req.chapterId])

  if (existing) {
    return {
      id: existing.id,
      chapterId: existing.chapter_id,
      questions: JSON.parse(existing.questions_json),
      createdAt: existing.created_at,
    }
  }

  const client = createClient()
  const content = truncateContent(req.chapterContent)

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: 'system', content: QUIZ_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `章节标题：${req.chapterTitle}\n\n章节内容：\n${content}`,
      },
    ],
    temperature: 0.5,
  })

  const text = response.choices[0]?.message?.content || '[]'
  const questions = parseJsonFromResponse<QuizQuestion[]>(text)

  const quizId = uuidv4()
  runSql(
    `INSERT INTO quizzes (id, chapter_id, questions_json) VALUES (?, ?, ?)`,
    [quizId, req.chapterId, JSON.stringify(questions)]
  )

  return {
    id: quizId,
    chapterId: req.chapterId,
    questions,
    createdAt: new Date().toISOString(),
  }
}

export async function gradeQuiz(req: GradeQuizRequest): Promise<{
  score: number
  results: { questionId: string; correct: boolean; feedback: string }[]
}> {
  const choiceAndFill = req.questions.filter((q) => q.type === 'choice' || q.type === 'fill')
  const shortQuestions = req.questions.filter((q) => q.type === 'short')

  const autoResults = choiceAndFill.map((q) => {
    const userAnswer = req.answers.find((a) => a.questionId === q.id)?.answer || ''
    const correct = normalizeAnswer(userAnswer) === normalizeAnswer(q.correctAnswer)
    return {
      questionId: q.id,
      correct,
      feedback: correct ? '回答正确' : `正确答案：${q.correctAnswer}. ${q.explanation}`,
    }
  })

  let shortResults: { questionId: string; correct: boolean; feedback: string }[] = []
  if (shortQuestions.length > 0) {
    const client = createClient()
    const payload = shortQuestions.map((q) => ({
      questionId: q.id,
      question: q.question,
      correctAnswer: q.correctAnswer,
      userAnswer: req.answers.find((a) => a.questionId === q.id)?.answer || '',
      rubric: q.explanation,
    }))

    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: GRADE_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      temperature: 0.3,
    })

    const parsed = parseJsonFromResponse<{ results: typeof shortResults }>(
      response.choices[0]?.message?.content || '{"results":[]}'
    )
    shortResults = parsed.results
  }

  const allResults = [...autoResults, ...shortResults]
  const score = allResults.length > 0
    ? Math.round((allResults.filter((r) => r.correct).length / allResults.length) * 100)
    : 0

  return { score, results: allResults }
}

export async function analyzeWeakPoints(req: AnalyzeWeakPointsRequest): Promise<WeakPoint[]> {
  const wrongItems = req.results.filter((r) => !r.correct)
  if (wrongItems.length === 0) return []

  const client = createClient()
  const teachingMode = req.teachingMode || getDefaultTeachingMode()
  const details = wrongItems.map((r) => {
    const q = req.questions.find((q) => q.id === r.questionId)
    const a = req.answers.find((a) => a.questionId === r.questionId)
    return {
      question: q?.question,
      correctAnswer: q?.correctAnswer,
      userAnswer: a?.answer,
      feedback: r.feedback,
    }
  })

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: 'system',
        content: `${WEAK_POINTS_SYSTEM_PROMPT}\n\n请使用${modeLabel(teachingMode)}风格编写 miniLesson。`,
      },
      { role: 'user', content: JSON.stringify(details) },
    ],
    temperature: 0.6,
  })

  return parseJsonFromResponse<WeakPoint[]>(response.choices[0]?.message?.content || '[]')
}

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/^[a-d]\.\s*/i, '')
}

function modeLabel(mode: TeachingMode): string {
  const labels = { direct: '直述式', socratic: '苏格拉底式', feynman: '费曼式', analogy: '类比式' }
  return labels[mode]
}

export function getQuizByChapter(chapterId: string): Quiz | null {
  const row = queryOne<{
    id: string
    chapter_id: string
    questions_json: string
    created_at: string
  }>('SELECT * FROM quizzes WHERE chapter_id = ?', [chapterId])
  if (!row) return null
  return {
    id: row.id,
    chapterId: row.chapter_id,
    questions: JSON.parse(row.questions_json),
    createdAt: row.created_at,
  }
}

export function saveQuizAttempt(data: {
  quizId: string
  answers: { questionId: string; answer: string }[]
  score: number
  weakPoints: WeakPoint[]
}) {
  const id = uuidv4()
  runSql(
    `INSERT INTO quiz_attempts (id, quiz_id, answers_json, score, weak_points_json) VALUES (?, ?, ?, ?, ?)`,
    [id, data.quizId, JSON.stringify(data.answers), data.score, JSON.stringify(data.weakPoints)]
  )
  return {
    id,
    quizId: data.quizId,
    answers: data.answers,
    score: data.score,
    weakPoints: data.weakPoints,
    createdAt: new Date().toISOString(),
  }
}

export function getQuizAttempts(quizId: string) {
  const rows = queryAll<{
    id: string
    quiz_id: string
    answers_json: string
    score: number
    weak_points_json: string
    created_at: string
  }>('SELECT * FROM quiz_attempts WHERE quiz_id = ? ORDER BY created_at DESC', [quizId])
  return rows.map((r) => ({
    id: r.id,
    quizId: r.quiz_id,
    answers: JSON.parse(r.answers_json),
    score: r.score,
    weakPoints: JSON.parse(r.weak_points_json),
    createdAt: r.created_at,
  }))
}

export function getLatestQuizAttempt(quizId: string) {
  const attempts = getQuizAttempts(quizId)
  return attempts[0] || null
}
