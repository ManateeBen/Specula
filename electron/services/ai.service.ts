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
  buildQuizUserMessage,
  buildWeakPointsUserMessage,
  truncateContent,
  parseJsonFromResponse,
  parseJsonArrayFromResponse,
} from './prompts'
import {
  retrieveTopChunks,
  type ChapterChunk,
  type WrongItemForRetrieval,
} from './chapterRetrieval'
import type {
  ExplainRequest,
  ImageExplainRequest,
  GenerateQuizRequest,
  GradeQuizRequest,
  AnalyzeWeakPointsRequest,
  QuizQuestion,
  Quiz,
  WeakPoint,
} from '../../src/types'
import { TEACHING_MODE_LABELS } from '../../src/types'

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

// Token ceilings keep a single response (and its cost) bounded.
const MAX_TOKENS_EXPLAIN = 1024
const MAX_TOKENS_QUIZ = 2048
const MAX_TOKENS_GRADE = 1024
const MAX_TOKENS_WEAK_POINTS = 4096

export async function explainImageStream(req: ImageExplainRequest, win: BrowserWindow): Promise<void> {
  try {
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
      max_tokens: MAX_TOKENS_EXPLAIN,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        win.webContents.send('ai:explain-chunk', content)
      }
    }
    win.webContents.send('ai:explain-done')
  } catch (err) {
    win.webContents.send('ai:explain-error', err instanceof Error ? err.message : '图片解释失败')
    throw err
  }
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
    max_tokens: MAX_TOKENS_EXPLAIN,
  })
  return response.choices[0]?.message?.content || '无法生成解释'
}

export async function explainTextStream(req: ExplainRequest, win: BrowserWindow): Promise<void> {
  try {
    const client = createClient()
    const stream = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: TEACHING_PROMPTS[req.teachingMode] },
        { role: 'user', content: buildExplainUserMessage(req) },
      ],
      temperature: 0.7,
      max_tokens: MAX_TOKENS_EXPLAIN,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        win.webContents.send('ai:explain-chunk', content)
      }
    }
    win.webContents.send('ai:explain-done')
  } catch (err) {
    win.webContents.send('ai:explain-error', err instanceof Error ? err.message : 'AI 解释失败')
    throw err
  }
}

export async function generateQuiz(req: GenerateQuizRequest): Promise<Quiz> {
  const client = createClient()
  const content = truncateContent(req.chapterContent)
  const isRegenerate = !!(req.avoidQuestions && req.avoidQuestions.length > 0)

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: 'system', content: QUIZ_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildQuizUserMessage(req.chapterTitle, content, req.avoidQuestions),
      },
    ],
    // Higher temperature when regenerating so the new set diverges from the last.
    temperature: isRegenerate ? 0.9 : 0.5,
    max_tokens: MAX_TOKENS_QUIZ,
  })

  const text = response.choices[0]?.message?.content || '[]'
  const questions = parseJsonFromResponse<QuizQuestion[]>(text)

  // One quiz per chapter: reuse the existing row (preserving its id, so prior
  // attempts stay linked) and just refresh the questions when regenerating.
  const existing = queryOne<{ id: string }>('SELECT id FROM quizzes WHERE chapter_id = ?', [req.chapterId])
  const now = new Date().toISOString()
  let quizId: string
  if (existing) {
    quizId = existing.id
    runSql(
      `UPDATE quizzes SET questions_json = ?, created_at = ? WHERE id = ?`,
      [JSON.stringify(questions), now, quizId]
    )
  } else {
    quizId = uuidv4()
    runSql(
      `INSERT INTO quizzes (id, chapter_id, questions_json) VALUES (?, ?, ?)`,
      [quizId, req.chapterId, JSON.stringify(questions)]
    )
  }

  return {
    id: quizId,
    chapterId: req.chapterId,
    questions,
    createdAt: now,
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
      max_tokens: MAX_TOKENS_GRADE,
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

const MIN_VERBATIM_LEN = 8
const FALLBACK_EXCERPT_LEN = 200

function resolveWeakPointAnchor(
  raw: {
    chunkId?: string
    verbatimQuote?: string
    sourceExcerpt?: string
  },
  chunks: ChapterChunk[]
): { sourceExcerpt: string; anchorChunkId?: string; anchorQuote?: string } {
  const chunkId = raw.chunkId?.trim()
  const quote = (raw.verbatimQuote || raw.sourceExcerpt || '').trim()
  const chunk = chunkId ? chunks.find((c) => c.id === chunkId) : undefined

  if (chunk && quote.length >= MIN_VERBATIM_LEN && chunk.text.includes(quote)) {
    return { sourceExcerpt: quote, anchorChunkId: chunk.id, anchorQuote: quote }
  }

  if (chunk) {
    const fallback = chunk.text.slice(0, FALLBACK_EXCERPT_LEN).trim()
    if (fallback.length > 0) {
      return { sourceExcerpt: fallback, anchorChunkId: chunk.id, anchorQuote: fallback }
    }
  }

  if (chunks.length > 0) {
    const fallback = chunks[0].text.slice(0, FALLBACK_EXCERPT_LEN).trim()
    return { sourceExcerpt: fallback, anchorChunkId: chunks[0].id, anchorQuote: fallback }
  }

  return { sourceExcerpt: quote || '' }
}

function isVerbatimValid(
  raw: { chunkId?: string; verbatimQuote?: string; sourceExcerpt?: string },
  chunks: ChapterChunk[]
): boolean {
  const chunkId = raw.chunkId?.trim()
  const quote = (raw.verbatimQuote || raw.sourceExcerpt || '').trim()
  if (!chunkId || quote.length < MIN_VERBATIM_LEN) return false
  const chunk = chunks.find((c) => c.id === chunkId)
  return !!chunk && chunk.text.includes(quote)
}

type WeakPointLlmItem = {
  topic: string
  reason: string
  category?: string
  miniLesson: string
  chunkId?: string
  verbatimQuote?: string
  sourceExcerpt?: string
}

async function callWeakPointsLlm(
  wrongItems: WrongItemForRetrieval[],
  chunks: ChapterChunk[],
  teachingMode: string,
  compact = false
): Promise<WeakPointLlmItem[]> {
  const client = createClient()
  const compactHint = compact
    ? '\n\n输出务必精简：miniLesson 每项不超过 100 字，reason 不超过 60 字，确保 JSON 数组完整闭合。'
    : ''
  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: 'system',
        content: `${WEAK_POINTS_SYSTEM_PROMPT}\n\n请使用${teachingMode}风格编写 miniLesson。${compactHint}`,
      },
      { role: 'user', content: buildWeakPointsUserMessage(wrongItems, chunks) },
    ],
    temperature: 0.3,
    max_tokens: MAX_TOKENS_WEAK_POINTS,
  })

  const content = response.choices[0]?.message?.content || '[]'
  const finishReason = response.choices[0]?.finish_reason

  try {
    return parseJsonArrayFromResponse<WeakPointLlmItem>(content)
  } catch (firstErr) {
    if (!compact) {
      return callWeakPointsLlm(wrongItems, chunks, teachingMode, true)
    }
    if (finishReason === 'length') {
      throw new Error('薄弱点分析输出过长被截断，请减少错题数量后重试')
    }
    throw firstErr
  }
}

export async function analyzeWeakPoints(req: AnalyzeWeakPointsRequest): Promise<WeakPoint[]> {
  const wrongItems = req.results.filter((r) => !r.correct)
  if (wrongItems.length === 0) return []

  const teachingMode = req.teachingMode || getDefaultTeachingMode()
  const details: WrongItemForRetrieval[] = wrongItems.map((r) => {
    const q = req.questions.find((q) => q.id === r.questionId)
    const a = req.answers.find((a) => a.questionId === r.questionId)
    return {
      questionId: r.questionId,
      question: q?.question,
      correctAnswer: q?.correctAnswer,
      userAnswer: a?.answer,
      feedback: r.feedback,
    }
  })

  const chapterContent = req.chapterContent?.trim() || ''
  const chunks = chapterContent ? retrieveTopChunks(chapterContent, details, 3) : []

  let parsed = await callWeakPointsLlm(details, chunks, TEACHING_MODE_LABELS[teachingMode])

  const needsRetry =
    chunks.length > 0 && parsed.some((raw) => !isVerbatimValid(raw, chunks))

  if (needsRetry) {
    parsed = await callWeakPointsLlm(details, chunks, TEACHING_MODE_LABELS[teachingMode])
  }

  return parsed.map((wp) => {
    const anchor = resolveWeakPointAnchor(wp, chunks)
    return {
      topic: wp.topic,
      reason: wp.reason,
      category: (wp.category as WeakPoint['category']) || 'concept_confusion',
      miniLesson: wp.miniLesson,
      sourceExcerpt: anchor.sourceExcerpt || wp.topic,
      anchorChunkId: anchor.anchorChunkId,
      anchorQuote: anchor.anchorQuote,
    }
  })
}

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/^[a-d]\.\s*/i, '')
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
  results: { questionId: string; correct: boolean; feedback: string }[]
  timeTakenMs: number
}) {
  const id = uuidv4()
  const completedAt = new Date().toISOString()
  runSql(
    `INSERT INTO quiz_attempts (id, quiz_id, answers_json, score, weak_points_json, results_json, time_taken_ms, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.quizId, JSON.stringify(data.answers), data.score, JSON.stringify(data.weakPoints), JSON.stringify(data.results), data.timeTakenMs, completedAt]
  )
  return {
    id,
    quizId: data.quizId,
    answers: data.answers,
    score: data.score,
    weakPoints: data.weakPoints,
    results: data.results,
    timeTakenMs: data.timeTakenMs,
    completedAt,
    createdAt: completedAt,
  }
}

export function getQuizAttempts(quizId: string) {
  const rows = queryAll<{
    id: string
    quiz_id: string
    answers_json: string
    score: number
    weak_points_json: string
    results_json: string
    time_taken_ms: number
    completed_at: string
    created_at: string
  }>('SELECT * FROM quiz_attempts WHERE quiz_id = ? ORDER BY created_at DESC', [quizId])
  return rows.map((r) => ({
    id: r.id,
    quizId: r.quiz_id,
    answers: JSON.parse(r.answers_json),
    score: r.score,
    weakPoints: JSON.parse(r.weak_points_json),
    results: JSON.parse(r.results_json || '[]'),
    timeTakenMs: r.time_taken_ms || 0,
    completedAt: r.completed_at || r.created_at,
    createdAt: r.created_at,
  }))
}

export function getLatestQuizAttempt(quizId: string) {
  const attempts = getQuizAttempts(quizId)
  return attempts[0] || null
}

export function getQuizHistoryByChapter(chapterId: string) {
  const quiz = getQuizByChapter(chapterId)
  if (!quiz) return []
  return getQuizAttempts(quiz.id)
}
