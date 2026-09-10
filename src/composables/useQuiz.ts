import { computed, markRaw, ref } from 'vue'
import { recordAnswer, loadQuestions, shuffle, type QuestionFilter } from '../db'
import { isCorrectAnswer } from '../parser/questionParser'
import type { Question } from '../types'

interface SessionAnswer {
  selected: string[]
  submitted: boolean
  correct?: boolean
}

export interface StartQuizOptions {
  random?: boolean
  batchSize?: number
}

export function useQuiz() {
  const list = ref<Question[]>([])
  const index = ref(0)
  const session = ref<Record<string, SessionAnswer>>({})
  const submitting = ref(false)
  const loading = ref(true)
  const wrongPractice = ref(false)
  const unansweredMode = ref(false)
  const leftover = ref(0)
  const lastFilter = ref<QuestionFilter>({})
  const lastOptions = ref<StartQuizOptions>({})

  const current = computed(() => list.value[index.value] ?? null)
  const total = computed(() => list.value.length)
  const progressText = computed(() => (total.value ? `${index.value + 1} / ${total.value}` : '0 / 0'))
  const empty = computed(() => !loading.value && total.value === 0)
  const currentState = computed(() => {
    const question = current.value
    if (!question) return { selected: [] as string[], submitted: false, correct: undefined as boolean | undefined }
    return session.value[question.id] ?? { selected: [], submitted: false }
  })

  const selected = computed(() => currentState.value.selected)
  const submitted = computed(() => currentState.value.submitted)
  const isCorrect = computed(() => currentState.value.correct)
  const isLast = computed(() => total.value > 0 && index.value >= total.value - 1)
  const roundDone = computed(() => isLast.value && submitted.value)
  const canSubmit = computed(() => {
    if (!current.value || submitted.value) return false
    if (current.value.type === 'multi') return selected.value.length >= 1
    return selected.value.length === 1
  })
  const canGoNext = computed(() => submitted.value && !isLast.value)

  async function start(filter: QuestionFilter, options: StartQuizOptions = {}) {
    loading.value = true
    index.value = 0
    session.value = {}
    leftover.value = 0
    lastFilter.value = filter
    lastOptions.value = options
    wrongPractice.value = Boolean(filter.wrongOnly)
    unansweredMode.value = Boolean(filter.unansweredOnly)
    try {
      let loaded = await loadQuestions(filter)
      if (options.random) loaded = shuffle(loaded)
      const size = options.batchSize && options.batchSize > 0 ? Math.min(options.batchSize, loaded.length) : loaded.length
      leftover.value = Math.max(0, loaded.length - size)
      list.value = loaded.slice(0, size).map((item) => markRaw(item))
    } finally {
      loading.value = false
    }
  }

  async function startNextRound() {
    await start(lastFilter.value, lastOptions.value)
  }

  function setSelected(next: string[]) {
    const question = current.value
    if (!question || submitted.value) return
    session.value = {
      ...session.value,
      [question.id]: {
        selected: next,
        submitted: false,
      },
    }
  }

  function toggleOption(label: string) {
    const question = current.value
    if (!question || submitted.value) return
    if (question.type === 'judge' || question.type === 'single') {
      setSelected([label])
      return
    }
    const exists = selected.value.includes(label)
    setSelected(exists ? selected.value.filter((item) => item !== label) : [...selected.value, label])
  }

  async function submit() {
    const question = current.value
    if (!question || !canSubmit.value || submitting.value) return
    submitting.value = true
    const correct = isCorrectAnswer(question.answer, selected.value)
    try {
      const saved = await recordAnswer(String(question.id), [...selected.value], correct, wrongPractice.value)
      const finalCorrect = saved.correct
      session.value = {
        ...session.value,
        [question.id]: {
          selected: [...selected.value],
          submitted: true,
          correct: finalCorrect,
        },
      }
      return finalCorrect
    } finally {
      submitting.value = false
    }
  }

  function prev() {
    if (index.value > 0) index.value -= 1
  }

  function next() {
    if (!submitted.value || index.value >= list.value.length - 1) return false
    index.value += 1
    return true
  }

  return {
    list,
    index,
    current,
    total,
    progressText,
    selected,
    submitted,
    isCorrect,
    canSubmit,
    canGoNext,
    submitting,
    loading,
    empty,
    wrongPractice,
    unansweredMode,
    leftover,
    isLast,
    roundDone,
    start,
    startNextRound,
    toggleOption,
    submit,
    prev,
    next,
  }
}
