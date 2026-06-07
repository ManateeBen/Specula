import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, CheckCircle, XCircle } from 'lucide-react'
import type { Book, Chapter, Quiz, QuizQuestion, QuizAnswer } from '../types'

type Phase = 'loading' | 'quiz' | 'grading' | 'result'

export default function QuizPage() {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>()
  const navigate = useNavigate()
  const [book, setBook] = useState<Book | null>(null)
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [score, setScore] = useState(0)
  const [results, setResults] = useState<{ questionId: string; correct: boolean; feedback: string }[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bookId || !chapterId) return
    const init = async () => {
      const b = await window.specula.books.get(bookId)
      setBook(b)
      const chapters = await window.specula.chapters.listByBook(bookId)
      const ch = chapters.find((c) => c.id === chapterId) || null
      setChapter(ch)

      const existing = await window.specula.quiz.getByChapter(chapterId)
      if (existing) {
        setQuiz(existing)
        setPhase('quiz')
        return
      }

      setPhase('loading')
      try {
        const content = await window.specula.chapters.getContent(chapterId)
        if (!content.trim()) {
          setError('无法提取章节内容，请确保书籍格式正确')
          return
        }
        const q = await window.specula.ai.generateQuiz({
          chapterId,
          chapterTitle: ch?.title || '章节',
          chapterContent: content,
        })
        setQuiz(q)
        setPhase('quiz')
      } catch (err) {
        setError(err instanceof Error ? err.message : '生成测验失败')
      }
    }
    init()
  }, [bookId, chapterId])

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = async () => {
    if (!quiz || !chapterId) return
    setPhase('grading')

    const answerList: QuizAnswer[] = quiz.questions.map((q) => ({
      questionId: q.id,
      answer: answers[q.id] || '',
    }))

    try {
      const gradeResult = await window.specula.ai.gradeQuiz({
        questions: quiz.questions,
        answers: answerList,
      })
      setScore(gradeResult.score)
      setResults(gradeResult.results)

      const settings = await window.specula.settings.get()
      const weakPoints = await window.specula.ai.analyzeWeakPoints({
        questions: quiz.questions,
        answers: answerList,
        results: gradeResult.results,
        teachingMode: settings.defaultTeachingMode,
      })

      await window.specula.quiz.saveAttempt({
        quizId: quiz.id,
        answers: answerList,
        score: gradeResult.score,
        weakPoints,
      })

      setPhase('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : '评分失败')
      setPhase('quiz')
    }
  }

  const renderQuestion = (q: QuizQuestion, index: number) => {
    const result = results.find((r) => r.questionId === q.id)

    return (
      <div key={q.id} className="card p-4">
        <div className="mb-3 flex items-start gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-specula-100 text-xs font-medium text-specula-700 dark:bg-specula-900/30 dark:text-specula-400">
            {index + 1}
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">{q.question}</p>
            <span className="mt-1 inline-block text-xs text-gray-500">
              {q.type === 'choice' ? '选择题' : q.type === 'fill' ? '填空题' : '简答题'}
            </span>
          </div>
          {result && (
            result.correct ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )
          )}
        </div>

        {q.type === 'choice' && q.options && (
          <div className="ml-8 space-y-2">
            {q.options.map((opt) => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={q.id}
                  value={opt}
                  checked={answers[q.id] === opt}
                  onChange={() => handleAnswerChange(q.id, opt)}
                  disabled={phase === 'result'}
                  className="text-specula-600"
                />
                {opt}
              </label>
            ))}
          </div>
        )}

        {q.type === 'fill' && (
          <input
            type="text"
            value={answers[q.id] || ''}
            onChange={(e) => handleAnswerChange(q.id, e.target.value)}
            disabled={phase === 'result'}
            className="input ml-8"
            placeholder="请输入答案"
          />
        )}

        {q.type === 'short' && (
          <textarea
            value={answers[q.id] || ''}
            onChange={(e) => handleAnswerChange(q.id, e.target.value)}
            disabled={phase === 'result'}
            className="input ml-8 min-h-[80px] resize-y"
            placeholder="请输入你的回答"
          />
        )}

        {result && !result.correct && (
          <p className="ml-8 mt-2 text-xs text-red-600 dark:text-red-400">{result.feedback}</p>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to={`/reader/${bookId}`}
            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">章节测验</h1>
            <p className="text-sm text-gray-500">
              {book?.title} · {chapter?.title}
            </p>
          </div>
        </div>

        {phase === 'loading' && (
          <div className="flex flex-col items-center py-20">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-specula-500" />
            <p className="text-sm text-gray-500">AI 正在生成本章测验题...</p>
          </div>
        )}

        {error && (
          <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {(phase === 'quiz' || phase === 'grading' || phase === 'result') && quiz && (
          <>
            {phase === 'result' && (
              <div className="card mb-6 p-6 text-center">
                <div className="text-4xl font-bold text-specula-600">{score}</div>
                <div className="mt-1 text-sm text-gray-500">得分</div>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    onClick={() => navigate(`/review/${bookId}/${chapterId}`)}
                    className="btn-primary"
                  >
                    查看薄弱点分析
                  </button>
                  <button
                    onClick={() => {
                      setAnswers({})
                      setResults([])
                      setScore(0)
                      setPhase('quiz')
                    }}
                    className="btn-secondary"
                  >
                    重新作答
                  </button>
                  <Link to={`/reader/${bookId}`} className="btn-secondary">
                    返回阅读
                  </Link>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {quiz.questions.map((q, i) => renderQuestion(q, i))}
            </div>

            {phase === 'quiz' && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={Object.keys(answers).length < quiz.questions.length}
                  className="btn-primary"
                >
                  提交答案
                </button>
              </div>
            )}

            {phase === 'grading' && (
              <div className="mt-6 flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在评分与分析...
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
