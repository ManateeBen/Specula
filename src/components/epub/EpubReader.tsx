import { useEffect, useRef, useState } from 'react'
import type { Chapter, ImageSelectionInfo } from '../../types'

interface Props {
  bookId: string
  chapters: Chapter[]
  initialChapterId?: string | null
  onProgress: (chapterId: string | null, position: string) => void
  onTextSelect: (text: string, context: string, rect: DOMRect) => void
  onImageSelect?: (info: ImageSelectionInfo) => void
}

// We render EPUB chapters ourselves (chapter HTML fetched from the main process
// with images inlined). epub.js renders unreliably from in-memory archives in
// Electron, and native rendering also gives us native text selection for the AI
// highlight feature.
export default function EpubReader({
  bookId,
  chapters,
  initialChapterId,
  onProgress,
  onTextSelect,
  onImageSelect,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(
    initialChapterId || chapters[0]?.id || null
  )
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const chapter = chapters.find((c) => c.id === currentChapterId) || chapters[0]
    if (!chapter) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    window.specula.epub.getChapterHtml(bookId, chapter.startRef).then((h) => {
      if (cancelled) return
      setHtml(h || '<p style="opacity:.6">本章无可显示内容</p>')
      setLoading(false)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      onProgress(chapter.id, '')
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, currentChapterId])

  const idx = chapters.findIndex((c) => c.id === currentChapterId)
  const goPrev = () => {
    if (idx > 0) setCurrentChapterId(chapters[idx - 1].id)
  }
  const goNext = () => {
    if (idx >= 0 && idx < chapters.length - 1) setCurrentChapterId(chapters[idx + 1].id)
  }

  const handleMouseUp = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString().trim()
    if (!text) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const contextEl = range.commonAncestorContainer.parentElement
    const context = contextEl?.textContent?.slice(0, 500) || ''
    onTextSelect(text, context, rect)
  }

  // Click an inlined image to ask the vision model to explain it.
  const handleClick = (e: React.MouseEvent) => {
    if (!onImageSelect) return
    const target = e.target as HTMLElement
    if (target.tagName !== 'IMG') return
    const src = target.getAttribute('src') || ''
    if (!src.startsWith('data:image/')) return
    const alt = target.getAttribute('alt') || ''
    const figcaption =
      target.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || ''
    const context = target.parentElement?.textContent?.slice(0, 500) || ''
    const rect = target.getBoundingClientRect()
    onImageSelect({
      imageDataUrl: src,
      imageAltText: alt,
      imageCaption: figcaption,
      imageContext: context,
      rect,
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} onMouseUp={handleMouseUp} className="epub-container flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">加载章节中...</div>
        ) : (
          <div
            className="epub-content epub-content--images mx-auto max-w-3xl px-8 py-8"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={handleClick}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
        <button onClick={goPrev} disabled={idx <= 0} className="btn-secondary py-1.5 text-xs">
          上一章
        </button>
        <select
          value={currentChapterId || ''}
          onChange={(e) => setCurrentChapterId(e.target.value)}
          className="input max-w-xs py-1.5 text-xs"
        >
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.title}
            </option>
          ))}
        </select>
        <button
          onClick={goNext}
          disabled={idx >= chapters.length - 1}
          className="btn-secondary py-1.5 text-xs"
        >
          下一章
        </button>
      </div>
    </div>
  )
}
