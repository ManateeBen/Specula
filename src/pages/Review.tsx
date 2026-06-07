import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw, BookOpen, AlertTriangle } from 'lucide-react'
import type { Book, QuizAttempt, WeakPoint } from '../types'

const categoryLabels = {
  concept_confusion: '概念混淆',
  missing_detail: '遗漏细节',
  misunderstanding: '理解偏差',
}

export default function Review() {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>()
  const [book, setBook] = useState<Book | null>(null)
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bookId || !chapterId) return
    const load = async () => {
      const b = await window.specula.books.get(bookId)
      setBook(b)
      const quiz = await window.specula.quiz.getByChapter(chapterId)
      if (quiz) {
        const latest = await window.specula.quiz.getLatestAttempt(quiz.id)
        setAttempt(latest)
      }
      setLoading(false)
    }
    load()
  }, [bookId, chapterId])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-gray-500">加载中...</div>
  }

  if (!attempt) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-gray-500">暂无测验记录</p>
        <Link to={`/reader/${bookId}`} className="btn-primary">
          返回阅读
        </Link>
      </div>
    )
  }

  const weakPoints: WeakPoint[] = attempt.weakPoints

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
            <h1 className="text-lg font-bold">学习诊断</h1>
            <p className="text-sm text-gray-500">{book?.title}</p>
          </div>
        </div>

        <div className="card mb-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-specula-600">{attempt.score}</div>
              <div className="text-sm text-gray-500">本次得分</div>
            </div>
            {weakPoints.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <BookOpen className="h-5 w-5" />
                <span className="text-sm font-medium">全部掌握！</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm font-medium">{weakPoints.length} 个薄弱点</span>
              </div>
            )}
          </div>
        </div>

        {weakPoints.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              恭喜！你已经很好地理解了本章内容。可以尝试下一章或重新测验巩固。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-500">薄弱知识点分析</h2>
            {weakPoints.map((wp, i) => (
              <div key={i} className="card p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    {categoryLabels[wp.category]}
                  </span>
                  <h3 className="font-medium">{wp.topic}</h3>
                </div>
                <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{wp.reason}</p>
                <div className="rounded-lg bg-specula-50 p-4 dark:bg-specula-900/20">
                  <div className="mb-1 text-xs font-medium text-specula-700 dark:text-specula-400">
                    针对性教学
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{wp.miniLesson}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Link to={`/reader/${bookId}`} className="btn-secondary flex-1">
            <BookOpen className="h-4 w-4" />
            继续阅读
          </Link>
          <Link
            to={`/quiz/${bookId}/${chapterId}`}
            className="btn-primary flex-1"
          >
            <RefreshCw className="h-4 w-4" />
            重新测验
          </Link>
        </div>
      </div>
    </div>
  )
}
