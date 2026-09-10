import type { ParseError, ParsedQuestion, ParseResult } from '../types'

export function cleanText(input: string): string {
  return input.replace(/[^\S\n]+/g, ' ').trim()
}

const TYPE_MAP = {
  判断题: 'judge',
  单选题: 'single',
  多选题: 'multi',
} as const

type Draft = {
  sourceNo: string
  type: ParsedQuestion['type']
  stem: string
  options: { label: string; text: string }[]
  answerRaw: string
  analysis: string
}

function normalizeJudgeAnswer(raw: string): string | null {
  const value = raw.trim()
  if (/^(正确|对|√|是|T|true)$/i.test(value)) return '正确'
  if (/^(错误|错|×|✕|否|F|false)$/i.test(value)) return '错误'
  return null
}

function parseChoiceLetters(raw: string): string[] {
  const letters = raw.toUpperCase().match(/[A-Z]/g) ?? []
  return [...new Set(letters)]
}

function stemKey(stem: string): string {
  return stem.replace(/[\s\p{P}\p{S}]/gu, '')
}

function validate(draft: Draft): { ok: true; question: ParsedQuestion } | { ok: false; error: ParseError } {
  const stem = cleanText(draft.stem)
  const analysis = cleanText(draft.analysis)
  const fail = (reason: string): { ok: false; error: ParseError } => ({
    ok: false,
    error: { sourceNo: draft.sourceNo, stem, reason },
  })

  if (!stem) return fail('题干为空')

  if (draft.type === 'judge') {
    if (!draft.answerRaw) return fail('缺少答案')
    const answer = normalizeJudgeAnswer(draft.answerRaw)
    if (!answer) return fail(`判断题答案无法识别：${draft.answerRaw}`)
    return {
      ok: true,
      question: {
        sourceNo: draft.sourceNo,
        type: 'judge',
        stem,
        options: [],
        answer: [answer],
        analysis: analysis || undefined,
      },
    }
  }

  if (draft.options.length < 2) return fail('选项不足 2 个')
  if (!draft.answerRaw) return fail('缺少答案')

  const labels = new Set(draft.options.map((item) => item.label))
  const letters = parseChoiceLetters(draft.answerRaw)
  if (!letters.length) return fail(`答案无法识别：${draft.answerRaw}`)

  const missing = letters.filter((letter) => !labels.has(letter))
  if (missing.length) return fail(`答案选项不存在：${missing.join('')}`)

  if (draft.type === 'single' && letters.length !== 1) {
    return fail('单选题答案必须是 1 个选项')
  }

  return {
    ok: true,
    question: {
      sourceNo: draft.sourceNo,
      type: draft.type,
      stem,
      options: draft.options.map((item) => ({
        label: item.label,
        text: cleanText(item.text),
      })),
      answer: letters,
      analysis: analysis || undefined,
    },
  }
}

export function parseQuestionText(text: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const questions: ParsedQuestion[] = []
  const errors: ParseError[] = []
  let current: Draft | null = null

  const flush = () => {
    if (!current) return
    const result = validate(current)
    if (result.ok) questions.push(result.question)
    else errors.push(result.error)
    current = null
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    const header = trimmed.match(/^(\d+)、【(判断题|单选题|多选题)】(.*)$/)
    if (header) {
      flush()
      current = {
        sourceNo: header[1],
        type: TYPE_MAP[header[2] as keyof typeof TYPE_MAP],
        stem: cleanText(header[3]),
        options: [],
        answerRaw: '',
        analysis: '',
      }
      continue
    }

    if (!current) continue

    const option = trimmed.match(/^([A-Z])、(.*)$/)
    if (option) {
      current.options.push({ label: option[1], text: cleanText(option[2]) })
      continue
    }

    const answer = trimmed.match(/^答案[：:](.*)$/)
    if (answer) {
      current.answerRaw = answer[1].trim()
      continue
    }

    const analysis = trimmed.match(/^解析[：:](.*)$/)
    if (analysis) {
      current.analysis = cleanText(analysis[1])
      continue
    }

    const extra = cleanText(trimmed)
    if (current.options.length) {
      const last = current.options[current.options.length - 1]
      last.text = cleanText(`${last.text} ${extra}`)
    } else {
      current.stem = cleanText(`${current.stem} ${extra}`)
    }
  }

  flush()

  const seen = new Set<string>()
  const unique: ParsedQuestion[] = []
  for (const question of questions) {
    const key = `${question.type}:${stemKey(question.stem)}`
    if (seen.has(key)) {
      errors.push({
        sourceNo: question.sourceNo,
        stem: question.stem,
        reason: '与本套题库中已有题目重复',
      })
      continue
    }
    seen.add(key)
    unique.push(question)
  }

  const counts = {
    judge: unique.filter((item) => item.type === 'judge').length,
    single: unique.filter((item) => item.type === 'single').length,
    multi: unique.filter((item) => item.type === 'multi').length,
    skipped: errors.length,
  }

  return { questions: unique, errors, counts }
}

export async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (utf8.includes('\uFFFD')) {
    try {
      return new TextDecoder('gbk').decode(buffer)
    } catch {
      return utf8
    }
  }
  return utf8
}

export function mergeParseResults(results: ParseResult[]): ParseResult {
  const questions: ParsedQuestion[] = []
  const errors: ParseError[] = []
  const seen = new Set<string>()

  for (const result of results) {
    for (const question of result.questions) {
      const key = `${question.type}:${stemKey(question.stem)}`
      if (seen.has(key)) {
        errors.push({
          sourceNo: question.sourceNo,
          stem: question.stem,
          reason: '与本套题库中已有题目重复',
        })
        continue
      }
      seen.add(key)
      questions.push(question)
    }
    errors.push(...result.errors)
  }

  return {
    questions,
    errors,
    counts: {
      judge: questions.filter((item) => item.type === 'judge').length,
      single: questions.filter((item) => item.type === 'single').length,
      multi: questions.filter((item) => item.type === 'multi').length,
      skipped: errors.length,
    },
  }
}

export function isCorrectAnswer(standard: string[], user: string[]): boolean {
  return [...standard].sort().join(',') === [...user].sort().join(',')
}
