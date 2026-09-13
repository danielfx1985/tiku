import { api } from '../api'
import type {
  ExamPaper,
  ExamRecordDetail,
  ExamRecordSummary,
  ExamResult,
  ExamRule,
  HomeStats,
  ParsedQuestion,
  Question,
  QuestionBank,
  QuestionType,
  WrongRecord,
} from '../types'

export interface QuestionFilter {
  bankId?: string
  type?: QuestionType
  wrongOnly?: boolean
  unansweredOnly?: boolean
}

export interface WrongListItem {
  record: WrongRecord
  question: Question
}

export async function importBank(name: string, parsed: ParsedQuestion[], skipped: number): Promise<QuestionBank> {
  const data = await api<{ bank: QuestionBank }>('/banks', {
    method: 'POST',
    body: JSON.stringify({ name, questions: parsed, skipped }),
  })
  return data.bank
}

export async function listBanks(): Promise<QuestionBank[]> {
  const data = await api<{ banks: QuestionBank[] }>('/banks')
  return data.banks
}

export async function deleteBank(bankId: string): Promise<void> {
  await api(`/banks/${encodeURIComponent(bankId)}`, { method: 'DELETE' })
}

export async function getHomeStats(bankId?: string): Promise<HomeStats> {
  const query = bankId ? `?bankId=${encodeURIComponent(bankId)}` : ''
  const data = await api<{ stats: HomeStats }>(`/stats${query}`)
  return data.stats
}

export async function loadQuestions(filter: QuestionFilter): Promise<Question[]> {
  const params = new URLSearchParams()
  if (filter.bankId) params.set('bankId', filter.bankId)
  if (filter.type) params.set('type', filter.type)
  if (filter.unansweredOnly) params.set('unanswered', '1')
  if (filter.wrongOnly) params.set('wrong', '1')
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const data = await api<{ questions: Question[] }>(`/questions${suffix}`)
  return data.questions
}

export async function generateExam(bankId: string | undefined, rules: ExamRule[]): Promise<ExamPaper> {
  return api<ExamPaper>('/exams/generate', {
    method: 'POST',
    body: JSON.stringify({
      bankId,
      rules: rules.filter((rule) => rule.count > 0),
    }),
  })
}

export async function submitExam(
  rules: ExamRule[],
  answers: { questionId: string; userAnswer: string[] }[],
): Promise<ExamResult> {
  return api<ExamResult>('/exams/submit', {
    method: 'POST',
    body: JSON.stringify({
      rules: rules.filter((rule) => rule.count > 0),
      answers,
    }),
  })
}

export async function listExams(): Promise<ExamRecordSummary[]> {
  const data = await api<{ exams: ExamRecordSummary[] }>('/exams')
  return data.exams
}

export async function getExam(id: string): Promise<ExamRecordDetail> {
  return api<ExamRecordDetail>(`/exams/${encodeURIComponent(id)}`)
}

export async function removeExam(id: string): Promise<void> {
  await api(`/exams/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function recordAnswer(
  questionId: string,
  userAnswer: string[],
  _correct: boolean,
  wrongPractice: boolean,
): Promise<{ correct: boolean }> {
  return api<{ correct: boolean }>('/answers', {
    method: 'POST',
    body: JSON.stringify({ questionId, userAnswer, wrongPractice }),
  })
}

export async function listWrongItems(): Promise<WrongListItem[]> {
  const data = await api<{ items: WrongListItem[] }>('/wrongs')
  return data.items
}

export async function removeWrong(questionId: string): Promise<void> {
  await api(`/wrongs/${encodeURIComponent(questionId)}`, { method: 'DELETE' })
}

export interface AiSettings {
  enabled: boolean
  baseUrl: string
  model: string
  systemPrompt: string
  apiKeySet: boolean
  apiKeyMasked: string
}

export async function getAiStatus(): Promise<{ enabled: boolean }> {
  return api<{ enabled: boolean }>('/ai/status')
}

export async function explainQuestion(questionId: string): Promise<{ explanation: string }> {
  return api<{ explanation: string }>(`/questions/${encodeURIComponent(questionId)}/ai-explain`, {
    method: 'POST',
  })
}

export async function getAiSettings(): Promise<AiSettings> {
  return api<AiSettings>('/settings/ai')
}

export async function saveAiSettings(payload: {
  enabled: boolean
  baseUrl: string
  model: string
  systemPrompt: string
  apiKey?: string
}): Promise<AiSettings> {
  return api<AiSettings>('/settings/ai', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function shuffle<T>(list: T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
