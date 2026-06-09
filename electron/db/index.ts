import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let db: SqlJsDatabase | null = null
let dbPath = ''

function getWasmPath(): string {
  const candidates = [
    path.join(__dirname, 'sql-wasm.wasm'),
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(process.resourcesPath || '', 'sql-wasm.wasm'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return path.join(__dirname, 'sql-wasm.wasm')
}

export function getDbPath(): string {
  const userData = app.getPath('userData')
  return path.join(userData, 'specula.db')
}

export function getBooksDir(): string {
  const dir = path.join(app.getPath('userData'), 'books')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getCoversDir(): string {
  const dir = path.join(app.getPath('userData'), 'covers')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
// Tail of the write chain; new writes queue after the previous one finishes so
// overlapping schedules never race on the same file.
let persistChain: Promise<void> = Promise.resolve()

// Debounced async persist: batches rapid writes (page turns, bulk inserts) into
// a single async disk write instead of a synchronous full export on every call.
function schedulePersist(): void {
  if (!db) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistChain = persistChain.catch(() => {}).then(() => {
      if (!db) return
      const data = db.export()
      return fs.promises.writeFile(dbPath, Buffer.from(data))
    })
  }, 300)
}

// Synchronous flush for shutdown / init paths where we must not lose data.
function persistDbSync(): void {
  if (!db) return
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export async function initDatabase(): Promise<SqlJsDatabase> {
  if (db) return db

  dbPath = getDbPath()
  const SQL = await initSqlJs({
    locateFile: () => getWasmPath(),
  })

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL CHECK(format IN ('epub', 'pdf')),
      file_path TEXT NOT NULL,
      cover_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      start_ref TEXT NOT NULL,
      end_ref TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      chapter_id TEXT,
      position TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      chapter_id TEXT,
      selected_text TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      ai_explanation TEXT,
      teaching_mode TEXT,
      source TEXT NOT NULL DEFAULT 'user',
      weak_point_topic TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL UNIQUE REFERENCES chapters(id) ON DELETE CASCADE,
      questions_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      answers_json TEXT NOT NULL,
      score REAL NOT NULL,
      weak_points_json TEXT NOT NULL DEFAULT '[]',
      results_json TEXT NOT NULL DEFAULT '[]',
      time_taken_ms INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
    CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights(book_id);
    CREATE INDEX IF NOT EXISTS idx_quizzes_chapter ON quizzes(chapter_id);
  `)

  // Migrate: add source and weak_point_topic columns to highlights if missing
  try {
    db.run(`ALTER TABLE highlights ADD COLUMN source TEXT NOT NULL DEFAULT 'user'`)
  } catch { /* column already exists */ }
  try {
    db.run(`ALTER TABLE highlights ADD COLUMN weak_point_topic TEXT`)
  } catch { /* column already exists */ }
  try {
    db.run(`ALTER TABLE highlights ADD COLUMN weak_point_index INTEGER`)
  } catch { /* column already exists */ }

  // Migrate: add results_json, time_taken_ms, completed_at to quiz_attempts
  try {
    db.run(`ALTER TABLE quiz_attempts ADD COLUMN results_json TEXT NOT NULL DEFAULT '[]'`)
  } catch { /* column already exists */ }
  try {
    db.run(`ALTER TABLE quiz_attempts ADD COLUMN time_taken_ms INTEGER NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }
  try {
    db.run(`ALTER TABLE quiz_attempts ADD COLUMN completed_at TEXT`)
  } catch { /* column already exists */ }

  // Migrate: enforce one quiz per chapter. Older DBs may hold several quiz rows
  // for the same chapter (the previous code inserted a new quiz on every
  // generation). Collapse them into the earliest row per chapter, re-pointing
  // existing attempts so no history is lost, then add the UNIQUE index.
  try {
    db.run(`
      UPDATE quiz_attempts
      SET quiz_id = (
        SELECT MIN(q2.id) FROM quizzes q2
        WHERE q2.chapter_id = (SELECT chapter_id FROM quizzes WHERE id = quiz_attempts.quiz_id)
      )
      WHERE EXISTS (SELECT 1 FROM quizzes WHERE id = quiz_attempts.quiz_id)
    `)
    db.run(`DELETE FROM quizzes WHERE id NOT IN (SELECT MIN(id) FROM quizzes GROUP BY chapter_id)`)
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_chapter_unique ON quizzes(chapter_id)`)
  } catch { /* dedup best-effort */ }

  persistDbSync()
  return db
}

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function runSql(sql: string, params: unknown[] = []): void {
  const database = getDatabase()
  database.run(sql, params as (string | number | null)[])
  schedulePersist()
}

// Run multiple statements inside a single transaction, persisting only once.
// Use for bulk inserts (chapter import, batch highlights) to avoid a full DB
// export per row.
export function runMany(statements: { sql: string; params?: unknown[] }[]): void {
  const database = getDatabase()
  database.run('BEGIN TRANSACTION')
  try {
    for (const s of statements) {
      database.run(s.sql, (s.params || []) as (string | number | null)[])
    }
    database.run('COMMIT')
  } catch (err) {
    database.run('ROLLBACK')
    throw err
  }
  schedulePersist()
}

export function queryAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const database = getDatabase()
  const stmt = database.prepare(sql)
  stmt.bind(params as (string | number | null)[])
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

export function queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  const rows = queryAll<T>(sql, params)
  return rows[0]
}

export function closeDatabase(): void {
  if (db) {
    persistDbSync()
    db.close()
    db = null
  }
}
