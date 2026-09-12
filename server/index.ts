import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import { isCorrectAnswer } from '../src/parser/questionParser.ts'
import { TYPE_LABEL, type ExamRule, type ParsedQuestion, type Question, type QuestionType } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const JWT_SECRET = process.env.JWT_SECRET || 'quiz-practice-dev-secret'
const dataDir = join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'quiz.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS banks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    imported_by TEXT NOT NULL,
    skipped INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (imported_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    bank_id TEXT NOT NULL,
    source_no TEXT NOT NULL,
    type TEXT NOT NULL,
    stem TEXT NOT NULL,
    options_json TEXT NOT NULL,
    answer_json TEXT NOT NULL,
    analysis TEXT,
    FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS progress (
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    last_result TEXT NOT NULL,
    last_answered_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS wrongs (
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    wrong_count INTEGER NOT NULL,
    last_wrong_at INTEGER NOT NULL,
    last_wrong_choice_json TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

function migrate() {
  const columns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((item) => item.name)
  if (!columns.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
  }
  const bankCols = (db.prepare('PRAGMA table_info(banks)').all() as { name: string }[]).map((item) => item.name)
  if (!bankCols.includes('is_public')) {
    db.exec('ALTER TABLE banks ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1')
  }
  db.exec(`
    UPDATE users SET role = 'admin'
    WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
  `)
}

migrate()

type UserRole = 'admin' | 'user'
type AuthUser = { id: string; username: string; role: UserRole }
type AuthedRequest = Request & { user?: AuthUser }

const stmts = {
  insertUser: db.prepare(
    'INSERT INTO users (id, username, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)',
  ),
  findUserByName: db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?'),
  findUserById: db.prepare('SELECT id, username, role FROM users WHERE id = ?'),
  countUsers: db.prepare('SELECT COUNT(*) AS count FROM users'),
  insertBank: db.prepare(
    'INSERT INTO banks (id, name, imported_at, imported_by, skipped, is_public) VALUES (?, ?, ?, ?, ?, ?)',
  ),
  listBanks: db.prepare(
    `SELECT b.id, b.name, b.imported_at AS importedAt, b.imported_by AS importedBy, b.skipped,
            b.is_public AS isPublic, u.username AS importedByName
     FROM banks b JOIN users u ON u.id = b.imported_by
     WHERE b.is_public = 1 OR b.imported_by = ?
     ORDER BY b.imported_at DESC`,
  ),
  getBank: db.prepare(
    'SELECT id, name, imported_by AS importedBy, is_public AS isPublic FROM banks WHERE id = ?',
  ),
  deleteBank: db.prepare('DELETE FROM banks WHERE id = ?'),
  insertQuestion: db.prepare(
    `INSERT INTO questions (id, bank_id, source_no, type, stem, options_json, answer_json, analysis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  getQuestion: db.prepare(
    `SELECT q.*, b.is_public AS isPublic, b.imported_by AS importedBy
     FROM questions q JOIN banks b ON b.id = q.bank_id WHERE q.id = ?`,
  ),
  questionByBankType: db.prepare('SELECT type, COUNT(*) AS count FROM questions WHERE bank_id = ? GROUP BY type'),
  questionsByBank: db.prepare('SELECT * FROM questions WHERE bank_id = ?'),
  visibleQuestions: db.prepare(
    `SELECT q.* FROM questions q JOIN banks b ON b.id = q.bank_id
     WHERE b.is_public = 1 OR b.imported_by = ?`,
  ),
  visibleQuestionsByType: db.prepare(
    `SELECT q.* FROM questions q JOIN banks b ON b.id = q.bank_id
     WHERE (b.is_public = 1 OR b.imported_by = ?) AND q.type = ?`,
  ),
  deleteQuestionsByBank: db.prepare('DELETE FROM questions WHERE bank_id = ?'),
  progressByUser: db.prepare(
    'SELECT question_id AS questionId, last_result AS lastResult FROM progress WHERE user_id = ?',
  ),
  progressIds: db.prepare('SELECT question_id AS questionId FROM progress WHERE user_id = ?'),
  upsertProgress: db.prepare(
    `INSERT INTO progress (user_id, question_id, last_result, last_answered_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, question_id) DO UPDATE SET last_result = excluded.last_result, last_answered_at = excluded.last_answered_at`,
  ),
  getWrong: db.prepare('SELECT wrong_count AS wrongCount FROM wrongs WHERE user_id = ? AND question_id = ?'),
  upsertWrong: db.prepare(
    `INSERT INTO wrongs (user_id, question_id, wrong_count, last_wrong_at, last_wrong_choice_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       wrong_count = excluded.wrong_count,
       last_wrong_at = excluded.last_wrong_at,
       last_wrong_choice_json = excluded.last_wrong_choice_json`,
  ),
  deleteWrong: db.prepare('DELETE FROM wrongs WHERE user_id = ? AND question_id = ?'),
  listWrongs: db.prepare(
    `SELECT w.question_id AS questionId, w.wrong_count AS wrongCount, w.last_wrong_at AS lastWrongAt,
            w.last_wrong_choice_json AS lastWrongChoiceJson
     FROM wrongs w WHERE w.user_id = ? ORDER BY w.wrong_count DESC, w.last_wrong_at DESC`,
  ),
  deleteProgressByQuestions: db.prepare(
    `DELETE FROM progress WHERE question_id IN (SELECT id FROM questions WHERE bank_id = ?)`,
  ),
  deleteWrongsByQuestions: db.prepare(
    `DELETE FROM wrongs WHERE question_id IN (SELECT id FROM questions WHERE bank_id = ?)`,
  ),
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  upsertSetting: db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ),
}

function fingerprint(bankId: string, question: ParsedQuestion): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        bankId,
        type: question.type,
        stem: question.stem,
        options: question.options,
      }),
    )
    .digest('hex')
    .slice(0, 32)
}

function mapQuestion(row: Record<string, unknown>): Question {
  return {
    id: String(row.id),
    bankId: String(row.bank_id),
    sourceNo: String(row.source_no),
    type: row.type as QuestionType,
    stem: String(row.stem),
    options: JSON.parse(String(row.options_json || '[]')),
    answer: JSON.parse(String(row.answer_json || '[]')),
    analysis: row.analysis ? String(row.analysis) : undefined,
  }
}

function sortBySourceNo(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => {
    const left = Number(a.sourceNo)
    const right = Number(b.sourceNo)
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right
    return a.sourceNo.localeCompare(b.sourceNo, 'zh')
  })
}

function runTransaction(fn: () => void) {
  db.exec('BEGIN')
  try {
    fn()
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '30d' })
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '仅管理员可操作' })
    return
  }
  next()
}

const AI_SETTING_KEYS = {
  enabled: 'ai.enabled',
  baseUrl: 'ai.baseUrl',
  apiKey: 'ai.apiKey',
  model: 'ai.model',
  systemPrompt: 'ai.systemPrompt',
} as const

const DEFAULT_AI_SYSTEM_PROMPT =
  '你是一位严谨的题库讲解老师。根据题目、选项和正确答案，说明为什么要选这个答案，并补充必要的背景知识。不要编造题目中没有的选项。用简洁中文回答。'

const AI_REQUEST_TIMEOUT_MS = 60_000

function getSetting(key: string): string {
  const row = stmts.getSetting.get(key) as { value: string } | undefined
  return row?.value ?? ''
}

function setSetting(key: string, value: string) {
  stmts.upsertSetting.run(key, value)
}

function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return '****'
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`
}

function readAiSettings() {
  const apiKey = getSetting(AI_SETTING_KEYS.apiKey)
  return {
    enabled: getSetting(AI_SETTING_KEYS.enabled) === '1',
    baseUrl: getSetting(AI_SETTING_KEYS.baseUrl),
    model: getSetting(AI_SETTING_KEYS.model),
    systemPrompt: getSetting(AI_SETTING_KEYS.systemPrompt) || DEFAULT_AI_SYSTEM_PROMPT,
    apiKey,
  }
}

function isAiReady(settings = readAiSettings()) {
  return Boolean(settings.enabled && settings.baseUrl.trim() && settings.apiKey.trim() && settings.model.trim())
}

function publicAiSettings() {
  const settings = readAiSettings()
  return {
    enabled: settings.enabled,
    baseUrl: settings.baseUrl,
    model: settings.model,
    systemPrompt: settings.systemPrompt,
    apiKeySet: Boolean(settings.apiKey),
    apiKeyMasked: maskApiKey(settings.apiKey),
  }
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

function buildExplainPrompt(question: Question): string {
  const lines = [`题型：${TYPE_LABEL[question.type]}`, `题干：${question.stem}`]
  if (question.options.length) {
    lines.push('选项：')
    for (const option of question.options) {
      lines.push(`${option.label}、${option.text}`)
    }
  }
  const answer = question.type === 'judge' ? question.answer[0] : question.answer.join('')
  lines.push(`正确答案：${answer}`)
  if (question.analysis) lines.push(`已有解析：${question.analysis}`)
  lines.push('请说明为什么要选这个答案，并补充相关背景知识。')
  return lines.join('\n')
}

class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function requestAiExplanation(question: Question): Promise<string> {
  const settings = readAiSettings()
  if (!isAiReady(settings)) {
    throw new HttpError('管理员尚未配置 AI', 400)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(chatCompletionsUrl(settings.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: settings.systemPrompt || DEFAULT_AI_SYSTEM_PROMPT },
          { role: 'user', content: buildExplainPrompt(question) },
        ],
      }),
      signal: controller.signal,
    })
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string
      choices?: { message?: { content?: string } }[]
    }
    if (!response.ok) {
      const message =
        typeof data.error === 'string' ? data.error : data.error?.message || `AI 接口返回 ${response.status}`
      throw new HttpError(message, 502)
    }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) throw new HttpError('AI 未返回讲解内容', 502)
    return text
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError('AI 请求超时，请稍后重试', 504)
    }
    throw new HttpError(error instanceof Error ? error.message : 'AI 讲解失败', 502)
  } finally {
    clearTimeout(timer)
  }
}

function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: '请先登录' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string }
    const row = stmts.findUserById.get(payload.id) as AuthUser | undefined
    if (!row) {
      res.status(401).json({ error: '登录已过期，请重新登录' })
      return
    }
    req.user = { id: row.id, username: row.username, role: row.role === 'admin' ? 'admin' : 'user' }
    next()
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}

function bankCounts(bankId: string) {
  const rows = stmts.questionByBankType.all(bankId) as { type: QuestionType; count: number | bigint }[]
  const counts = { judge: 0, single: 0, multi: 0, skipped: 0 }
  for (const row of rows) counts[row.type] = Number(row.count)
  return counts
}

function publicUser(user: AuthUser): AuthUser {
  return { id: user.id, username: user.username, role: user.role }
}

function canSeeBank(user: AuthUser, bank: { importedBy: string; isPublic: number | bigint }): boolean {
  return Number(bank.isPublic) === 1 || bank.importedBy === user.id
}

function canDeleteBank(user: AuthUser, bank: { importedBy: string; isPublic: number | bigint }): boolean {
  const isPublic = Number(bank.isPublic) === 1
  if (isPublic) return user.role === 'admin'
  return bank.importedBy === user.id
}

function loadPool(user: AuthUser, bankId?: string, type?: string): Question[] {
  if (bankId) {
    const bank = stmts.getBank.get(bankId) as { importedBy: string; isPublic: number | bigint } | undefined
    if (!bank || !canSeeBank(user, bank)) return []
    const rows = stmts.questionsByBank.all(bankId) as Record<string, unknown>[]
    const questions = rows.map(mapQuestion)
    return sortBySourceNo(type ? questions.filter((item) => item.type === type) : questions)
  }
  const rows = (
    type ? stmts.visibleQuestionsByType.all(user.id, type) : stmts.visibleQuestions.all(user.id)
  ) as Record<string, unknown>[]
  return sortBySourceNo(rows.map(mapQuestion))
}

const EXAM_TYPE_ORDER: QuestionType[] = ['judge', 'single', 'multi']

function shuffleList<T>(list: T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

function parseExamRules(raw: unknown): { ok: true; rules: ExamRule[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) {
    return { ok: false, error: '请设置试卷题型' }
  }
  const seen = new Set<QuestionType>()
  const rules: ExamRule[] = []
  for (const item of raw) {
    const type = item?.type as QuestionType
    if (!EXAM_TYPE_ORDER.includes(type)) {
      return { ok: false, error: '题型无效' }
    }
    if (seen.has(type)) {
      return { ok: false, error: '题型重复' }
    }
    seen.add(type)
    const count = Number(item?.count)
    const score = Number(item?.score)
    if (!Number.isInteger(count) || count < 0) {
      return { ok: false, error: `${TYPE_LABEL[type]}数量须为大于等于 0 的整数` }
    }
    if (count > 0 && (!Number.isFinite(score) || score <= 0)) {
      return { ok: false, error: `${TYPE_LABEL[type]}每题分值须大于 0` }
    }
    if (count > 0) rules.push({ type, count, score: roundScore(score) })
  }
  if (!rules.length) {
    return { ok: false, error: '请至少抽取 1 题' }
  }
  rules.sort((a, b) => EXAM_TYPE_ORDER.indexOf(a.type) - EXAM_TYPE_ORDER.indexOf(b.type))
  return { ok: true, rules }
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '8mb' }))

app.post('/api/auth/register', (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]{2,20}$/.test(username)) {
    res.status(400).json({ error: '用户名为 2-20 位中文、字母、数字或下划线' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: '密码至少 6 位' })
    return
  }
  if (stmts.findUserByName.get(username)) {
    res.status(409).json({ error: '用户名已被占用' })
    return
  }
  const existingCount = Number((stmts.countUsers.get() as { count: number | bigint }).count)
  const role: UserRole = existingCount === 0 ? 'admin' : 'user'
  const user = { id: randomUUID(), username, role }
  stmts.insertUser.run(user.id, username, bcrypt.hashSync(password, 10), Date.now(), role)
  res.json({ token: signToken(user), user: publicUser(user) })
})

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  const row = stmts.findUserByName.get(username) as
    | { id: string; username: string; password_hash: string; role: string }
    | undefined
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }
  const user: AuthUser = {
    id: row.id,
    username: row.username,
    role: row.role === 'admin' ? 'admin' : 'user',
  }
  res.json({ token: signToken(user), user: publicUser(user) })
})

app.get('/api/auth/me', auth, (req: AuthedRequest, res) => {
  res.json({ user: publicUser(req.user!) })
})

app.get('/api/banks', auth, (req: AuthedRequest, res) => {
  const rows = stmts.listBanks.all(req.user!.id) as {
    id: string
    name: string
    importedAt: number | bigint
    importedBy: string
    importedByName: string
    skipped: number | bigint
    isPublic: number | bigint
  }[]
  res.json({
    banks: rows.map((row) => {
      const counts = bankCounts(row.id)
      counts.skipped = Number(row.skipped)
      const isPublic = Number(row.isPublic) === 1
      return {
        id: row.id,
        name: row.name,
        importedAt: Number(row.importedAt),
        importedBy: row.importedBy,
        importedByName: row.importedByName,
        isPublic,
        canDelete: canDeleteBank(req.user!, row),
        counts,
      }
    }),
  })
})

app.post('/api/banks', auth, (req: AuthedRequest, res) => {
  const name = String(req.body?.name || '').trim()
  const incoming = Array.isArray(req.body?.questions) ? (req.body.questions as ParsedQuestion[]) : []
  const skippedInput = Number(req.body?.skipped || 0)
  if (!name) {
    res.status(400).json({ error: '请填写题库名称' })
    return
  }
  if (!incoming.length) {
    res.status(400).json({ error: '没有可导入的题目' })
    return
  }

  const isPublic = req.user!.role === 'admin' ? 1 : 0
  const bankId = randomUUID()
  const now = Date.now()
  let inserted = 0
  let dup = 0
  const insertMany = () => {
    runTransaction(() => {
      stmts.insertBank.run(bankId, name, now, req.user!.id, skippedInput, isPublic)
      for (const item of incoming) {
        const id = fingerprint(bankId, item)
        if (stmts.getQuestion.get(id)) {
          dup += 1
          continue
        }
        stmts.insertQuestion.run(
          id,
          bankId,
          String(item.sourceNo || ''),
          item.type,
          item.stem,
          JSON.stringify(item.options || []),
          JSON.stringify(item.answer || []),
          item.analysis || null,
        )
        inserted += 1
      }
      if (!inserted) {
        stmts.deleteBank.run(bankId)
      } else if (dup) {
        db.prepare('UPDATE banks SET skipped = ? WHERE id = ?').run(skippedInput + dup, bankId)
      }
    })
  }
  insertMany()

  if (!inserted) {
    res.status(409).json({ error: '这些题目已在题库中，未重复导入' })
    return
  }

  const counts = bankCounts(bankId)
  counts.skipped = skippedInput + dup
  res.json({
    bank: {
      id: bankId,
      name,
      importedAt: now,
      importedBy: req.user!.id,
      importedByName: req.user!.username,
      isPublic: isPublic === 1,
      canDelete: true,
      counts,
    },
  })
})

app.delete('/api/banks/:id', auth, (req: AuthedRequest, res) => {
  const bankId = String(req.params.id)
  const bank = stmts.getBank.get(bankId) as
    | { id: string; importedBy: string; isPublic: number | bigint }
    | undefined
  if (!bank) {
    res.status(404).json({ error: '题库不存在' })
    return
  }
  if (!canDeleteBank(req.user!, bank)) {
    res.status(403).json({ error: '没有权限删除该题库' })
    return
  }
  runTransaction(() => {
    stmts.deleteProgressByQuestions.run(bank.id)
    stmts.deleteWrongsByQuestions.run(bank.id)
    stmts.deleteQuestionsByBank.run(bank.id)
    stmts.deleteBank.run(bank.id)
  })
  res.json({ ok: true })
})

app.get('/api/stats', auth, (req: AuthedRequest, res) => {
  const bankId = typeof req.query.bankId === 'string' ? req.query.bankId : undefined
  const questions = loadPool(req.user!, bankId)
  const progressRows = stmts.progressByUser.all(req.user!.id) as { questionId: string; lastResult: string }[]
  const progressMap = new Map(progressRows.map((item) => [item.questionId, item.lastResult]))
  const practicedQuestions = questions.filter((item) => progressMap.has(item.id))
  const practiced = practicedQuestions.length
  const correct = practicedQuestions.filter((item) => progressMap.get(item.id) === 'correct').length
  const questionIds = new Set(questions.map((item) => item.id))
  const wrongRows = stmts.listWrongs.all(req.user!.id) as { questionId: string }[]
  res.json({
    stats: {
      total: questions.length,
      practiced,
      unanswered: questions.length - practiced,
      correct,
      accuracy: practiced ? Math.round((correct / practiced) * 100) : 0,
      wrong: wrongRows.filter((item) => questionIds.has(item.questionId)).length,
      byType: {
        judge: questions.filter((item) => item.type === 'judge').length,
        single: questions.filter((item) => item.type === 'single').length,
        multi: questions.filter((item) => item.type === 'multi').length,
      },
    },
  })
})

app.get('/api/questions', auth, (req: AuthedRequest, res) => {
  const bankId = typeof req.query.bankId === 'string' ? req.query.bankId : undefined
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  const unansweredOnly = req.query.unanswered === '1'
  const wrongOnly = req.query.wrong === '1'
  const userId = req.user!.id

  if (wrongOnly) {
    const wrongs = stmts.listWrongs.all(userId) as { questionId: string }[]
    const questions: Question[] = []
    for (const record of wrongs) {
      const row = stmts.getQuestion.get(record.questionId) as Record<string, unknown> | undefined
      if (!row) continue
      const question = mapQuestion(row)
      const bankMeta = {
        importedBy: String(row.importedBy || ''),
        isPublic: Number(row.isPublic ?? 0),
      }
      if (!canSeeBank(req.user!, bankMeta)) continue
      if (type && question.type !== type) continue
      if (bankId && question.bankId !== bankId) continue
      questions.push(question)
    }
    res.json({ questions })
    return
  }

  let questions = loadPool(req.user!, bankId, type)
  if (unansweredOnly) {
    const done = new Set(
      (stmts.progressIds.all(userId) as { questionId: string }[]).map((item) => item.questionId),
    )
    questions = questions.filter((item) => !done.has(item.id))
  }
  res.json({ questions })
})

app.post('/api/exams/generate', auth, (req: AuthedRequest, res) => {
  const parsed = parseExamRules(req.body?.rules)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const bankId = typeof req.body?.bankId === 'string' && req.body.bankId ? String(req.body.bankId) : undefined
  const pool = loadPool(req.user!, bankId)
  const byType: Record<QuestionType, Question[]> = { judge: [], single: [], multi: [] }
  for (const question of pool) byType[question.type].push(question)

  const questions: Question[] = []
  for (const type of EXAM_TYPE_ORDER) {
    const rule = parsed.rules.find((item) => item.type === type)
    if (!rule) continue
    if (byType[type].length < rule.count) {
      res.status(400).json({
        error: `${TYPE_LABEL[type]}仅 ${byType[type].length} 题，无法抽取 ${rule.count} 题`,
      })
      return
    }
    questions.push(...shuffleList(byType[type]).slice(0, rule.count))
  }

  res.json({
    questions,
    rules: parsed.rules,
    totalCount: questions.length,
    totalScore: roundScore(parsed.rules.reduce((sum, rule) => sum + rule.count * rule.score, 0)),
  })
})

app.post('/api/exams/submit', auth, (req: AuthedRequest, res) => {
  const parsed = parseExamRules(req.body?.rules)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : []
  if (!rawAnswers.length) {
    res.status(400).json({ error: '没有可交卷的题目' })
    return
  }

  const ruleByType = new Map(parsed.rules.map((rule) => [rule.type, rule]))
  const seen = new Set<string>()
  const details: {
    questionId: string
    type: QuestionType
    correct: boolean
    score: number
    fullScore: number
    userAnswer: string[]
  }[] = []
  const wrongs: { questionId: string; userAnswer: string[] }[] = []
  const scoreByType: Record<QuestionType, number> = { judge: 0, single: 0, multi: 0 }
  const fullByType: Record<QuestionType, number> = { judge: 0, single: 0, multi: 0 }

  for (const item of rawAnswers) {
    const questionId = String(item?.questionId || '')
    if (!questionId || seen.has(questionId)) {
      res.status(400).json({ error: '交卷题目无效' })
      return
    }
    seen.add(questionId)
    const userAnswer = Array.isArray(item?.userAnswer) ? item.userAnswer.map(String) : []
    const row = stmts.getQuestion.get(questionId) as Record<string, unknown> | undefined
    if (!row) {
      res.status(400).json({ error: '题目不存在' })
      return
    }
    if (
      !canSeeBank(req.user!, {
        importedBy: String(row.importedBy || ''),
        isPublic: Number(row.isPublic ?? 0),
      })
    ) {
      res.status(403).json({ error: '无权作答该题' })
      return
    }
    const question = mapQuestion(row)
    const rule = ruleByType.get(question.type)
    if (!rule) {
      res.status(400).json({ error: '题目与试卷规则不匹配' })
      return
    }
    const fullScore = rule.score
    const correct = userAnswer.length > 0 && isCorrectAnswer(question.answer, userAnswer)
    const score = correct ? fullScore : 0
    fullByType[question.type] = roundScore(fullByType[question.type] + fullScore)
    scoreByType[question.type] = roundScore(scoreByType[question.type] + score)
    details.push({
      questionId,
      type: question.type,
      correct,
      score,
      fullScore,
      userAnswer,
    })
    if (!correct) wrongs.push({ questionId, userAnswer })
  }

  const now = Date.now()
  const userId = req.user!.id
  runTransaction(() => {
    for (const wrong of wrongs) {
      const existing = stmts.getWrong.get(userId, wrong.questionId) as { wrongCount: number | bigint } | undefined
      stmts.upsertWrong.run(
        userId,
        wrong.questionId,
        Number(existing?.wrongCount ?? 0) + 1,
        now,
        JSON.stringify(wrong.userAnswer),
      )
    }
  })

  res.json({
    items: details,
    byType: {
      judge: { score: scoreByType.judge, full: fullByType.judge },
      single: { score: scoreByType.single, full: fullByType.single },
      multi: { score: scoreByType.multi, full: fullByType.multi },
    },
    total: roundScore(scoreByType.judge + scoreByType.single + scoreByType.multi),
    full: roundScore(fullByType.judge + fullByType.single + fullByType.multi),
  })
})

app.post('/api/answers', auth, (req: AuthedRequest, res) => {
  const questionId = String(req.body?.questionId || '')
  const userAnswer = Array.isArray(req.body?.userAnswer) ? req.body.userAnswer.map(String) : []
  const wrongPractice = Boolean(req.body?.wrongPractice)
  const row = stmts.getQuestion.get(questionId) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ error: '题目不存在' })
    return
  }
  if (
    !canSeeBank(req.user!, {
      importedBy: String(row.importedBy || ''),
      isPublic: Number(row.isPublic ?? 0),
    })
  ) {
    res.status(403).json({ error: '无权作答该题' })
    return
  }
  const question = mapQuestion(row)
  const correct = isCorrectAnswer(question.answer, userAnswer)
  const now = Date.now()
  const userId = req.user!.id
  runTransaction(() => {
    stmts.upsertProgress.run(userId, questionId, correct ? 'correct' : 'wrong', now)
    if (!correct) {
      const existing = stmts.getWrong.get(userId, questionId) as { wrongCount: number | bigint } | undefined
      stmts.upsertWrong.run(
        userId,
        questionId,
        Number(existing?.wrongCount ?? 0) + 1,
        now,
        JSON.stringify(userAnswer),
      )
      return
    }
    if (wrongPractice) stmts.deleteWrong.run(userId, questionId)
  })
  res.json({ correct })
})

app.get('/api/wrongs', auth, (req: AuthedRequest, res) => {
  const rows = stmts.listWrongs.all(req.user!.id) as {
    questionId: string
    wrongCount: number | bigint
    lastWrongAt: number | bigint
    lastWrongChoiceJson: string
  }[]
  const items = []
  for (const record of rows) {
    const row = stmts.getQuestion.get(record.questionId) as Record<string, unknown> | undefined
    if (!row) continue
    if (
      !canSeeBank(req.user!, {
        importedBy: String(row.importedBy || ''),
        isPublic: Number(row.isPublic ?? 0),
      })
    ) {
      continue
    }
    items.push({
      record: {
        questionId: record.questionId,
        wrongCount: Number(record.wrongCount),
        lastWrongAt: Number(record.lastWrongAt),
        lastWrongChoice: JSON.parse(record.lastWrongChoiceJson || '[]'),
      },
      question: mapQuestion(row),
    })
  }
  res.json({ items })
})

app.delete('/api/wrongs/:questionId', auth, (req: AuthedRequest, res) => {
  stmts.deleteWrong.run(req.user!.id, String(req.params.questionId))
  res.json({ ok: true })
})

app.get('/api/settings/ai', auth, requireAdmin, (_req: AuthedRequest, res) => {
  res.json(publicAiSettings())
})

app.put('/api/settings/ai', auth, requireAdmin, (req: AuthedRequest, res) => {
  const enabled = Boolean(req.body?.enabled)
  const baseUrl = String(req.body?.baseUrl || '').trim()
  const model = String(req.body?.model || '').trim()
  const systemPrompt = String(req.body?.systemPrompt || '').trim() || DEFAULT_AI_SYSTEM_PROMPT
  const incomingKey = String(req.body?.apiKey || '').trim()
  const apiKey = incomingKey || getSetting(AI_SETTING_KEYS.apiKey)
  if (enabled && (!baseUrl || !model || !apiKey)) {
    res.status(400).json({ error: '启用 AI 需要填写 Base URL、API Key 和模型名' })
    return
  }
  setSetting(AI_SETTING_KEYS.enabled, enabled ? '1' : '0')
  setSetting(AI_SETTING_KEYS.baseUrl, baseUrl)
  setSetting(AI_SETTING_KEYS.model, model)
  setSetting(AI_SETTING_KEYS.systemPrompt, systemPrompt)
  if (incomingKey) setSetting(AI_SETTING_KEYS.apiKey, incomingKey)
  res.json(publicAiSettings())
})

app.get('/api/ai/status', auth, (_req: AuthedRequest, res) => {
  res.json({ enabled: isAiReady() })
})

app.post('/api/questions/:id/ai-explain', auth, async (req: AuthedRequest, res) => {
  const questionId = String(req.params.id || '')
  const row = stmts.getQuestion.get(questionId) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ error: '题目不存在' })
    return
  }
  if (
    !canSeeBank(req.user!, {
      importedBy: String(row.importedBy || ''),
      isPublic: Number(row.isPublic ?? 0),
    })
  ) {
    res.status(403).json({ error: '无权查看该题' })
    return
  }
  try {
    const explanation = await requestAiExplanation(mapQuestion(row))
    res.json({ explanation })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502
    res.status(status).json({ error: error instanceof Error ? error.message : 'AI 讲解失败' })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`quiz api http://localhost:${PORT}`)
})
