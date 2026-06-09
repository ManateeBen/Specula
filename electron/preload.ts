import { contextBridge, ipcRenderer } from 'electron'
import type {
  SpeculaAPI,
  ExplainRequest,
  GenerateQuizRequest,
  GradeQuizRequest,
  AnalyzeWeakPointsRequest,
  AppSettings,
  ReadingProgress,
  Highlight,
  WeakPoint,
} from '../src/types'

const api: SpeculaAPI = {
  books: {
    import: () => ipcRenderer.invoke('books:import'),
    list: () => ipcRenderer.invoke('books:list'),
    delete: (id) => ipcRenderer.invoke('books:delete', id),
    get: (id) => ipcRenderer.invoke('books:get', id),
    getFileData: (id) => ipcRenderer.invoke('books:getFileData', id),
    getProgress: (bookId) => ipcRenderer.invoke('books:getProgress', bookId),
    saveProgress: (progress: Omit<ReadingProgress, 'updatedAt'>) =>
      ipcRenderer.invoke('books:saveProgress', progress),
    getCoverUrl: (coverPath) => ipcRenderer.invoke('books:getCoverUrl', coverPath),
  },
  chapters: {
    listByBook: (bookId) => ipcRenderer.invoke('chapters:listByBook', bookId),
    getContent: (chapterId) => ipcRenderer.invoke('chapters:getContent', chapterId),
  },
  epub: {
    getChapterHtml: (bookId, href) => ipcRenderer.invoke('epub:getChapterHtml', { bookId, href }),
  },
  highlights: {
    create: (data) => ipcRenderer.invoke('highlights:create', data) as Promise<Highlight>,
    listByBook: (bookId) => ipcRenderer.invoke('highlights:listByBook', bookId),
    delete: (id) => ipcRenderer.invoke('highlights:delete', id),
    createFromWeakPoints: (data: { bookId: string; chapterId: string; weakPoints: WeakPoint[] }) =>
      ipcRenderer.invoke('highlights:createFromWeakPoints', data) as Promise<Highlight[]>,
  },
  ai: {
    explain: (req: ExplainRequest) => ipcRenderer.invoke('ai:explain', req),
    explainStream: (req: ExplainRequest) => ipcRenderer.invoke('ai:explainStream', req),
    explainImageStream: (req) => ipcRenderer.invoke('ai:explainImageStream', req),
    onExplainChunk: (callback, onError) => {
      const handler = (_: unknown, chunk: string) => callback(chunk)
      const errorHandler = (_: unknown, message: string) => onError?.(message)
      const cleanup = () => {
        ipcRenderer.removeListener('ai:explain-chunk', handler)
        ipcRenderer.removeListener('ai:explain-done', doneHandler)
        ipcRenderer.removeListener('ai:explain-error', errorHandler)
      }
      const doneHandler = () => cleanup()
      ipcRenderer.on('ai:explain-chunk', handler)
      ipcRenderer.on('ai:explain-done', doneHandler)
      ipcRenderer.on('ai:explain-error', errorHandler)
      return cleanup
    },
    generateQuiz: (req: GenerateQuizRequest) => ipcRenderer.invoke('ai:generateQuiz', req),
    gradeQuiz: (req: GradeQuizRequest) => ipcRenderer.invoke('ai:gradeQuiz', req),
    analyzeWeakPoints: (req: AnalyzeWeakPointsRequest) =>
      ipcRenderer.invoke('ai:analyzeWeakPoints', req),
  },
  quiz: {
    getByChapter: (chapterId) => ipcRenderer.invoke('quiz:getByChapter', chapterId),
    saveAttempt: (attempt) => ipcRenderer.invoke('quiz:saveAttempt', attempt),
    getAttempts: (quizId) => ipcRenderer.invoke('quiz:getAttempts', quizId),
    getLatestAttempt: (quizId) => ipcRenderer.invoke('quiz:getLatestAttempt', quizId),
    getHistoryByChapter: (chapterId) => ipcRenderer.invoke('quiz:getHistoryByChapter', chapterId),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', settings),
    testConnection: () => ipcRenderer.invoke('settings:testConnection'),
    testVision: () => ipcRenderer.invoke('settings:testVision'),
  },
}

contextBridge.exposeInMainWorld('specula', api)
