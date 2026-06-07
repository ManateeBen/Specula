import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Highlighter, ClipboardList, PanelRightClose, PanelRightOpen } from 'lucide-react'
import EpubReader from '../components/epub/EpubReader'
import PdfReader from '../components/pdf/PdfReader'
import HighlightPopover from '../components/HighlightPopover'
import type { Book, Chapter, Highlight } from '../types'

export default function Reader() {
  const { bookId } = useParams<{ bookId: string }>()
  const [book, setBook] = useState<Book | null>(null)
  const [fileData, setFileData] = useState<Uint8Array | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selection, setSelection] = useState<{
    text: string
    context: string
    rect: DOMRect
  } | null>(null)
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null)
  const [initialPosition, setInitialPosition] = useState<string>('')

  useEffect(() => {
    if (!bookId) return
    const load = async () => {
      const b = await window.specula.books.get(bookId)
      setBook(b)
      // Only the PDF reader needs the raw bytes; EPUB renders chapter HTML via IPC.
      if (b?.format === 'pdf') {
        setFileData(await window.specula.books.getFileData(bookId))
      }
      const chs = await window.specula.chapters.listByBook(bookId)
      setChapters(chs)
      const progress = await window.specula.books.getProgress(bookId)
      if (progress) {
        setCurrentChapterId(progress.chapterId)
        setInitialPosition(progress.position)
      }
      const hl = await window.specula.highlights.listByBook(bookId)
      setHighlights(hl)
    }
    load()
  }, [bookId])

  const handleProgress = useCallback(
    async (chapterId: string | null, position: string) => {
      if (!bookId) return
      setCurrentChapterId(chapterId)
      await window.specula.books.saveProgress({ bookId, chapterId, position })
    },
    [bookId]
  )

  const handleTextSelect = useCallback((text: string, context: string, rect: DOMRect) => {
    setSelection({ text, context, rect })
  }, [])

  const refreshHighlights = async () => {
    if (!bookId) return
    const hl = await window.specula.highlights.listByBook(bookId)
    setHighlights(hl)
  }

  const currentChapter = chapters.find((c) => c.id === currentChapterId)

  if (!book || (book.format === 'pdf' && !fileData)) {
    return <div className="flex h-full items-center justify-center text-gray-500">加载中...</div>
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <Link to="/" className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h2 className="text-sm font-medium">{book.title}</h2>
              {currentChapter && (
                <p className="text-xs text-gray-500">{currentChapter.title}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentChapterId && (
              <Link
                to={`/quiz/${bookId}/${currentChapterId}`}
                className="btn-secondary py-1.5 text-xs"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                章节测验
              </Link>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {book.format === 'epub' ? (
            <EpubReader
              bookId={book.id}
              chapters={chapters}
              initialChapterId={currentChapterId}
              onProgress={handleProgress}
              onTextSelect={handleTextSelect}
            />
          ) : (
            <PdfReader
              data={fileData!}
              chapters={chapters}
              initialPosition={initialPosition}
              onProgress={handleProgress}
              onTextSelect={handleTextSelect}
            />
          )}

          {selection && bookId && (
            <HighlightPopover
              selection={selection}
              bookId={bookId}
              chapterId={currentChapterId}
              bookTitle={book.title}
              chapterTitle={currentChapter?.title}
              onClose={() => setSelection(null)}
              onSaved={refreshHighlights}
            />
          )}
        </div>
      </div>

      {sidebarOpen && (
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Highlighter className="h-4 w-4 text-yellow-500" />
              划线笔记 ({highlights.length})
            </div>
          </div>
          <div className="space-y-2 p-3">
            {highlights.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-500">
                选中文字即可 AI 解释并保存划线
              </p>
            ) : (
              highlights.map((h) => (
                <div key={h.id} className="card p-3">
                  <blockquote className="border-l-2 border-yellow-400 pl-2 text-xs italic">
                    {h.selectedText.slice(0, 100)}
                    {h.selectedText.length > 100 ? '...' : ''}
                  </blockquote>
                  {h.aiExplanation && (
                    <p className="mt-2 line-clamp-4 text-xs text-gray-600 dark:text-gray-400">
                      {h.aiExplanation}
                    </p>
                  )}
                  <button
                    onClick={async () => {
                      await window.specula.highlights.delete(h.id)
                      refreshHighlights()
                    }}
                    className="mt-2 text-xs text-red-500 hover:underline"
                  >
                    删除
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
