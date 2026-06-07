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
  deleteHighlight,
} from '../services/book.service'
import {
  explainText,
  explainTextStream,
  generateQuiz,
  gradeQuiz,
  analyzeWeakPoints,
  testConnection,
  getQuizByChapter,
  saveQuizAttempt,
  getQuizAttempts,
  getLatestQuizAttempt,
} from '../services/ai.service'
import { getSettings, setSettings } from '../services/settings.service'
import type {
  ExplainRequest,
  GenerateQuizRequest,
  GradeQuizRequest,
  AnalyzeWeakPointsRequest,
  AppSettings,
} from '../../src/types'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

export function registerIpcHandlers(): void {
  ipcMain.handle('books:import', () => importBook())
  ipcMain.handle('books:list', () => listBooks())
  ipcMain.handle('books:get', (_e, id: string) => getBook(id))
  ipcMain.handle('books:getFileData', (_e, id: string) => getFileData(id))
  ipcMain.handle('books:delete', (_e, id: string) => deleteBook(id))
  ipcMain.handle('books:getProgress', (_e, bookId: string) => getProgress(bookId))
  ipcMain.handle('books:saveProgress', (_e, data: { bookId: string; chapterId: string | null; position: string }) => {
    saveProgress(data.bookId, data.chapterId, data.position)
  })
  ipcMain.handle('books:getCoverUrl', (_e, coverPath: string | null) => {
    if (!coverPath) return null
    return `file://${coverPath.replace(/\\/g, '/')}`
  })

  ipcMain.handle('chapters:listByBook', (_e, bookId: string) => listChapters(bookId))
  ipcMain.handle('chapters:getContent', (_e, chapterId: string) => getChapterContent(chapterId))
  ipcMain.handle('epub:getChapterHtml', (_e, data: { bookId: string; href: string }) =>
    getEpubChapterHtml(data.bookId, data.href)
  )

  ipcMain.handle('highlights:listByBook', (_e, bookId: string) => {
    return listHighlights(bookId).map((h) => ({
      id: h.id,
      bookId: h.book_id,
      chapterId: h.chapter_id,
      selectedText: h.selected_text,
      context: h.context,
      aiExplanation: h.ai_explanation,
      teachingMode: h.teaching_mode,
      createdAt: h.created_at,
    }))
  })
  ipcMain.handle('highlights:create', (_e, data: {
    bookId: string
    chapterId: string | null
    selectedText: string
    context: string
    aiExplanation: string | null
    teachingMode: string | null
  }) => {
    const id = createHighlight(data)
    return { id, ...data, createdAt: new Date().toISOString() }
  })
  ipcMain.handle('highlights:delete', (_e, id: string) => deleteHighlight(id))

  ipcMain.handle('ai:explain', (_e, req: ExplainRequest) => explainText(req))
  ipcMain.handle('ai:explainStream', async (_e, req: ExplainRequest) => {
    if (!mainWindow) throw new Error('Window not available')
    await explainTextStream(req, mainWindow)
  })
  ipcMain.handle('ai:generateQuiz', (_e, req: GenerateQuizRequest) => generateQuiz(req))
  ipcMain.handle('ai:gradeQuiz', (_e, req: GradeQuizRequest) => gradeQuiz(req))
  ipcMain.handle('ai:analyzeWeakPoints', (_e, req: AnalyzeWeakPointsRequest) => analyzeWeakPoints(req))

  ipcMain.handle('quiz:getByChapter', (_e, chapterId: string) => getQuizByChapter(chapterId))
  ipcMain.handle('quiz:saveAttempt', (_e, data: {
    quizId: string
    answers: { questionId: string; answer: string }[]
    score: number
    weakPoints: import('../../src/types').WeakPoint[]
  }) => saveQuizAttempt(data))
  ipcMain.handle('quiz:getAttempts', (_e, quizId: string) => getQuizAttempts(quizId))
  ipcMain.handle('quiz:getLatestAttempt', (_e, quizId: string) => getLatestQuizAttempt(quizId))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) => setSettings(partial))
  ipcMain.handle('settings:testConnection', () => testConnection())
}
