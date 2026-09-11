import type { ExamRule, QuestionType } from './types'
import { TYPE_LABEL } from './types'

export const EXAM_RULES_STORAGE_KEY = 'exam-rules'
export const EXAM_TYPE_ORDER: QuestionType[] = ['judge', 'single', 'multi']

export const DEFAULT_EXAM_RULES: ExamRule[] = [
  { type: 'judge', count: 30, score: 1 },
  { type: 'single', count: 50, score: 0.5 },
  { type: 'multi', count: 15, score: 2 },
]

export function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

export function examTotals(rules: ExamRule[]): { count: number; score: number } {
  return {
    count: rules.reduce((sum, rule) => sum + (Number.isFinite(rule.count) ? rule.count : 0), 0),
    score: roundScore(
      rules.reduce((sum, rule) => {
        const count = Number.isFinite(rule.count) ? rule.count : 0
        const score = Number.isFinite(rule.score) ? rule.score : 0
        return sum + count * score
      }, 0),
    ),
  }
}

export function formatScore(value: number): string {
  return String(roundScore(value))
}

function cloneRules(rules: ExamRule[]): ExamRule[] {
  return EXAM_TYPE_ORDER.map((type) => {
    const found = rules.find((item) => item.type === type)
    return found ? { ...found } : { type, count: 0, score: 0 }
  })
}

export function loadSavedExamRules(): ExamRule[] {
  try {
    const raw = localStorage.getItem(EXAM_RULES_STORAGE_KEY)
    if (!raw) return cloneRules(DEFAULT_EXAM_RULES)
    const parsed = JSON.parse(raw) as ExamRule[]
    if (!Array.isArray(parsed)) return cloneRules(DEFAULT_EXAM_RULES)
    return cloneRules(parsed)
  } catch {
    return cloneRules(DEFAULT_EXAM_RULES)
  }
}

export function saveExamRules(rules: ExamRule[]): void {
  localStorage.setItem(EXAM_RULES_STORAGE_KEY, JSON.stringify(cloneRules(rules)))
}

export function rulesToQuery(rules: ExamRule[]): Record<string, string> {
  const query: Record<string, string> = {}
  for (const rule of rules) {
    query[rule.type] = String(rule.count)
    query[`${rule.type}Score`] = String(rule.score)
  }
  return query
}

export function rulesFromQuery(query: Record<string, unknown>): ExamRule[] {
  return EXAM_TYPE_ORDER.map((type) => {
    const count = Number(query[type])
    const score = Number(query[`${type}Score`])
    return {
      type,
      count: Number.isFinite(count) ? count : 0,
      score: Number.isFinite(score) ? score : 0,
    }
  })
}

export function validateExamRules(
  rules: ExamRule[],
  available: Record<QuestionType, number>,
): string | null {
  let total = 0
  for (const rule of rules) {
    if (!Number.isInteger(rule.count) || rule.count < 0) {
      return `${TYPE_LABEL[rule.type]}数量须为大于等于 0 的整数`
    }
    if (rule.count > 0 && (!Number.isFinite(rule.score) || rule.score <= 0)) {
      return `${TYPE_LABEL[rule.type]}每题分值须大于 0`
    }
    if (rule.count > available[rule.type]) {
      return `当前范围${TYPE_LABEL[rule.type]}仅 ${available[rule.type]} 题，无法抽取 ${rule.count} 题`
    }
    total += rule.count
  }
  if (!total) return '请至少抽取 1 题'
  return null
}

export function examSummary(rules: ExamRule[]): string {
  const parts = rules
    .filter((rule) => rule.count > 0)
    .map((rule) => {
      const name = TYPE_LABEL[rule.type].replace(/题$/, '')
      return `${name} ${rule.count}×${formatScore(rule.score)}=${formatScore(rule.count * rule.score)}`
    })
  const totals = examTotals(rules)
  const head = parts.length ? `${parts.join(' · ')} · ` : ''
  return `${head}共 ${totals.count} 题 / ${formatScore(totals.score)} 分`
}
