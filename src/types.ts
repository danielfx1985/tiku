export type QuestionType = 'judge' | 'single' | 'multi'

export interface QuestionBank {
  id: string
  name: string
  importedAt: number
  importedBy?: string
  importedByName?: string
  canDelete?: boolean
  isPublic?: boolean
  counts: {
    judge: number
    single: number
    multi: number
    skipped: number
  }
}

export interface Question {
  id: string
  bankId: string
  sourceNo: string
  type: QuestionType
  stem: string
  options: { label: string; text: string }[]
  answer: string[]
  analysis?: string
}

export interface WrongRecord {
  questionId: string
  wrongCount: number
  lastWrongAt: number
  lastWrongChoice: string[]
}

export interface Progress {
  questionId: string
  lastResult: 'correct' | 'wrong'
  lastAnsweredAt: number
}

export interface ParsedQuestion {
  sourceNo: string
  type: QuestionType
  stem: string
  options: { label: string; text: string }[]
  answer: string[]
  analysis?: string
}

export interface ParseError {
  sourceNo: string
  stem: string
  reason: string
}

export interface ParseResult {
  questions: ParsedQuestion[]
  errors: ParseError[]
  counts: {
    judge: number
    single: number
    multi: number
    skipped: number
  }
}

export interface HomeStats {
  total: number
  practiced: number
  unanswered: number
  correct: number
  accuracy: number
  wrong: number
  byType: Record<QuestionType, number>
}

export const TYPE_LABEL: Record<QuestionType, string> = {
  judge: '判断题',
  single: '单选题',
  multi: '多选题',
}

export interface ExamRule {
  type: QuestionType
  count: number
  score: number
}

export interface ExamPaper {
  questions: Question[]
  rules: ExamRule[]
  totalCount: number
  totalScore: number
}

export interface ExamAnswerItem {
  questionId: string
  type: QuestionType
  correct: boolean
  score: number
  fullScore: number
  userAnswer: string[]
}

export interface ExamTypeScore {
  score: number
  full: number
}

export interface ExamResult {
  items: ExamAnswerItem[]
  byType: Record<QuestionType, ExamTypeScore>
  total: number
  full: number
}
