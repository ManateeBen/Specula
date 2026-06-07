import { useCallback, useMemo, useState } from 'react'
import { Worker, Viewer } from '@react-pdf-viewer/core'
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/default-layout/lib/styles/index.css'
import type { Chapter } from '../../types'

interface Props {
  data: Uint8Array
  chapters: Chapter[]
  initialPosition?: string
  onProgress: (chapterId: string | null, position: string) => void
  onTextSelect: (text: string, context: string, rect: DOMRect) => void
}

export default function PdfReader({
  data,
  chapters,
  initialPosition,
  onProgress,
  onTextSelect,
}: Props) {
  const [landingPage, setLandingPage] = useState(parseInt(initialPosition || '1', 10) - 1)
  // Bumping this key remounts the Viewer so it honors a new initialPage on jump.
  const [viewerKey, setViewerKey] = useState(0)

  const defaultLayoutPluginInstance = defaultLayoutPlugin()

  // pdf.js transfers (and detaches) the ArrayBuffer it receives, so hand each
  // Viewer mount its own copy — keeps `data` reusable across chapter jumps.
  const fileData = useMemo(() => data.slice(), [data, viewerKey])

  const handlePageChange = useCallback(
    (e: { currentPage: number }) => {
      const pageNum = e.currentPage + 1
      const chapter = chapters.find(
        (c) => pageNum >= parseInt(c.startRef, 10) && pageNum <= parseInt(c.endRef, 10)
      )
      onProgress(chapter?.id || null, String(pageNum))
    },
    [chapters, onProgress]
  )

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString().trim()
    if (!text) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const context = range.commonAncestorContainer.textContent?.slice(0, 500) || ''
    onTextSelect(text, context, rect)
  }, [onTextSelect])

  const goToChapter = (chapterId: string) => {
    const ch = chapters.find((c) => c.id === chapterId)
    if (ch) {
      const page = parseInt(ch.startRef, 10) - 1
      setLandingPage(page)
      setViewerKey((k) => k + 1)
      onProgress(chapterId, ch.startRef)
    }
  }

  return (
    <div className="flex h-full flex-col" onMouseUp={handleMouseUp}>
      <div className="pdf-viewer-container flex-1 overflow-hidden">
        <Worker workerUrl={workerUrl}>
          <Viewer
            key={viewerKey}
            fileUrl={fileData}
            plugins={[defaultLayoutPluginInstance]}
            initialPage={landingPage}
            onPageChange={handlePageChange}
          />
        </Worker>
      </div>
      <div className="flex shrink-0 items-center justify-center border-t border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
        <select
          onChange={(e) => goToChapter(e.target.value)}
          className="input max-w-md py-1.5 text-xs"
          defaultValue=""
        >
          <option value="" disabled>
            跳转到章节
          </option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
