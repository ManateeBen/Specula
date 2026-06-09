import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import {
  importBook,
  listBooks,
  getBook,
  getFileData,
  deleteBook,
  listChapters,
  getChapterContent,
  getEpubChapterHtml,
  saveProgress,
  getProgress,
  listHighlights,
  createHighlight,
  createHighlightsFromWeakPoints,
  deleteHighlight,
} from '../services/book.service'
import {
  explainText,
  explainTextStream,
  explainImageStream,
  testVision,
  generateQuiz,
  gradeQuiz,
  analyzeWeakPoints,
  testConnection,
  getQuizByChapter,
  saveQuizAttempt,
  getQuizAttempts,
  getLatestQuizAttempt,
  getQuizHistoryByChapter,
} from '../services/ai.service'
import { getSettings, setSettings } from '../services/settings.service'
import type {
  ExplainRequest,
  ImageExplainRequest,
  GenerateQuizRequest,
  GradeQuizRequest,
  AnalyzeWeakPointsRequest,
  AppSettings,
} from '../../src/types'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

// Wrap every handler in a uniform try/catch so failures surface to the renderer
// as a clean Error (rejected invoke) and get logged in the main process,
// instead of leaking raw/serialized internals or failing silently.
function handle(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[IPC] ${channel} failed:`, err)
      throw new Error(message)
    }
  })
}

export function registerIpcHandlers(): void {
  handle('books:import', () => importBook())
  handle('books:list', () => listBooks())
  handle('books:get', (_e, id: string) => getBook(id))
  handle('books:getFileData', (_e, id: string) => getFileData(id))
  handle('books:delete', (_e, id: string) => deleteBook(id))
  handle('books:getProgress', (_e, bookId: string) => getProgress(bookId))
  handle('books:saveProgress', (_e, data: { bookId: string; chapterId: string | null; position: string }) => {
    saveProgress(data.bookId, data.chapterId, data.position)
  })
  handle('books:getCoverUrl', (_e, coverPath: string | null) => {
    if (!coverPath) return null
    return `file://${coverPath.replace(/\\/g, '/')}`
  })

  handle('chapters:listByBook', (_e, bookId: string) => listChapters(bookId))
  handle('chapters:getContent', (_e, chapterId: string) => getChapterContent(chapterId))
  handle('epub:getChapterHtml', (_e, data: { bookId: string; href: string }) =>
    getEpubChapterHtml(data.bookId, data.href)
  )

  handle('highlights:listByBook', (_e, bookId: string) => {
    return listHighlights(bookId).map((h) => ({
      id: h.id,
      bookId: h.book_id,
      chapterId: h.chapter_id,
      selectedText: h.selected_text,
      context: h.context,
      aiExplanation: h.ai_explanation,
      teachingMode: h.teaching_mode,
      source: h.source || 'user',
      weakPointTopic: h.weak_point_topic || null,
      weakPointIndex: h.weak_point_index ?? null,
      createdAt: h.created_at,
    }))
  })
  handle('highlights:create', (_e, data: {
    bookId: string
    chapterId: string | null
    selectedText: string
    context: string
    aiExplanation: string | null
    teachingMode: string | null
    source?: string
    weakPointTopic?: string | null
  }) => {
    const id = createHighlight(data)
    return {
      id,
      ...data,
      source: data.source || 'user',
      weakPointTopic: data.weakPointTopic || null,
      weakPointIndex: null,
      createdAt: new Date().toISOString(),
    }
  })
  handle('highlights:createFromWeakPoints', (_e, data: {
    bookId: string
    chapterId: string
    weakPoints: import('../../src/types').WeakPoint[]
  }) => {
    return createHighlightsFromWeakPoints(data)
  })
  handle('highlights:delete', (_e, id: string) => deleteHighlight(id))

  handle('ai:explain', (_e, req: ExplainRequest) => explainText(req))
  handle('ai:explainStream', async (_e, req: ExplainRequest) => {
    if (!mainWindow) throw new Error('Window not available')
    await explainTextStream(req, mainWindow)
  })
  handle('ai:explainImageStream', async (_e, req: ImageExplainRequest) => {
    if (!mainWindow) throw new Error('Window not available')
    await explainImageStream(req, mainWindow)
  })
  handle('ai:generateQuiz', (_e, req: GenerateQuizRequest) => generateQuiz(req))
  handle('ai:gradeQuiz', (_e, req: GradeQuizRequest) => gradeQuiz(req))
  handle('ai:analyzeWeakPoints', (_e, req: AnalyzeWeakPointsRequest) => analyzeWeakPoints(req))

  handle('quiz:getByChapter', (_e, chapterId: string) => getQuizByChapter(chapterId))
  handle('quiz:saveAttempt', (_e, data: {
    quizId: string
    answers: { questionId: string; answer: string }[]
    score: number
    weakPoints: import('../../src/types').WeakPoint[]
    results: { questionId: string; correct: boolean; feedback: string }[]
    timeTakenMs: number
  }) => saveQuizAttempt(data))
  handle('quiz:getAttempts', (_e, quizId: string) => getQuizAttempts(quizId))
  handle('quiz:getLatestAttempt', (_e, quizId: string) => getLatestQuizAttempt(quizId))
  handle('quiz:getHistoryByChapter', (_e, chapterId: string) => getQuizHistoryByChapter(chapterId))

  handle('settings:get', () => getSettings())
  handle('settings:set', (_e, partial: Partial<AppSettings>) => setSettings(partial))
  handle('settings:testConnection', () => testConnection())
  handle('settings:testVision', () => testVision())
}
