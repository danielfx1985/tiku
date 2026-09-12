<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import QuestionCard from '../components/QuestionCard.vue'
import { ApiError } from '../api'
import { generateExam, submitExam } from '../db'
import { examSummary, formatScore, rulesFromQuery, validateExamRules } from '../examConfig'
import type { ExamResult, ExamRule, Question } from '../types'
import { TYPE_LABEL } from '../types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const submitting = ref(false)
const questions = ref<Question[]>([])
const rules = ref<ExamRule[]>([])
const index = ref(0)
const answers = ref<Record<string, string[]>>({})
const result = ref<ExamResult | null>(null)

const current = computed(() => questions.value[index.value] ?? null)
const total = computed(() => questions.value.length)
const progressText = computed(() => (total.value ? `${index.value + 1} / ${total.value}` : '0 / 0'))
const empty = computed(() => !loading.value && total.value === 0)
const submitted = computed(() => Boolean(result.value))
const selected = computed(() => {
  const question = current.value
  if (!question) return [] as string[]
  return answers.value[question.id] ?? []
})
const isCorrect = computed(() => {
  const question = current.value
  if (!question || !result.value) return undefined
  return result.value.items.find((item) => item.questionId === question.id)?.correct
})
const currentScore = computed(() => {
  const question = current.value
  if (!question) return null
  return rules.value.find((item) => item.type === question.type)?.score ?? null
})
const answeredCount = computed(
  () => questions.value.filter((item) => (answers.value[item.id] || []).length > 0).length,
)
const unansweredCount = computed(() => Math.max(0, total.value - answeredCount.value))
const resultRows = computed(() => {
  if (!result.value) return []
  return rules.value.map((rule) => ({
    type: rule.type,
    score: result.value!.byType[rule.type].score,
    full: result.value!.byType[rule.type].full,
  }))
})
const resultById = computed(() => {
  const map = new Map<string, boolean>()
  if (!result.value) return map
  for (const item of result.value.items) map.set(item.questionId, item.correct)
  return map
})
const sheetItems = computed(() =>
  questions.value.map((question, questionIndex) => ({
    index: questionIndex,
    no: questionIndex + 1,
    correct: resultById.value.get(question.id) === true,
  })),
)
const correctCount = computed(() => sheetItems.value.filter((item) => item.correct).length)
const wrongCount = computed(() => sheetItems.value.length - correctCount.value)
const wrongOnly = ref(false)
const navIndices = computed(() => {
  if (!submitted.value || !wrongOnly.value) return questions.value.map((_, questionIndex) => questionIndex)
  return sheetItems.value.filter((item) => !item.correct).map((item) => item.index)
})
const canPrev = computed(() => navIndices.value.some((item) => item < index.value))
const canNext = computed(() => navIndices.value.some((item) => item > index.value))
const paperTitle = computed(() => (submitted.value ? '试卷回看' : '模拟试卷'))

onMounted(async () => {
  const parsed = rulesFromQuery(route.query as Record<string, unknown>)
  const invalid = validateExamRules(parsed, { judge: Number.MAX_SAFE_INTEGER, single: Number.MAX_SAFE_INTEGER, multi: Number.MAX_SAFE_INTEGER })
  if (invalid) {
    showToast(invalid)
    router.replace({ name: 'home' })
    return
  }
  try {
    const paper = await generateExam(
      typeof route.query.bankId === 'string' ? route.query.bankId : undefined,
      parsed,
    )
    questions.value = paper.questions
    rules.value = paper.rules
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '组卷失败')
    router.replace({ name: 'home' })
  } finally {
    loading.value = false
  }
})

function toggleOption(label: string) {
  const question = current.value
  if (!question || submitted.value) return
  const currentSelected = answers.value[question.id] ?? []
  const next =
    question.type === 'judge' || question.type === 'single'
      ? [label]
      : currentSelected.includes(label)
        ? currentSelected.filter((item) => item !== label)
        : [...currentSelected, label]
  answers.value = { ...answers.value, [question.id]: next }
}

function prev() {
  const prevIndex = [...navIndices.value].reverse().find((item) => item < index.value)
  if (prevIndex !== undefined) index.value = prevIndex
}

function next() {
  const nextIndex = navIndices.value.find((item) => item > index.value)
  if (nextIndex !== undefined) index.value = nextIndex
}

async function goTo(questionIndex: number) {
  index.value = questionIndex
  await nextTick()
  document.querySelector('.q-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function setWrongOnly(value: boolean) {
  if (value && wrongCount.value === 0) {
    showToast('没有错题')
    return
  }
  wrongOnly.value = value
  if (value && resultById.value.get(current.value?.id || '') === true) {
    const firstWrong = sheetItems.value.find((item) => !item.correct)
    if (firstWrong) index.value = firstWrong.index
  }
}

async function onSubmitPaper() {
  if (submitted.value || submitting.value || !total.value) return
  try {
    if (unansweredCount.value > 0) {
      await showConfirmDialog({
        title: '交卷确认',
        message: `还有 ${unansweredCount.value} 题未答，未答计 0 分。确定交卷吗？`,
      })
    } else {
      await showConfirmDialog({
        title: '交卷确认',
        message: '确定交卷吗？错题将收入错题本，不计入练习进度。',
      })
    }
  } catch {
    return
  }
  submitting.value = true
  try {
    result.value = await submitExam(
      rules.value,
      questions.value.map((question) => ({
        questionId: question.id,
        userAnswer: answers.value[question.id] ?? [],
      })),
    )
    showToast('已交卷')
    await nextTick()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '交卷失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page exam-page">
    <van-nav-bar :title="paperTitle" left-arrow @click-left="router.back()">
      <template #right>
        <span v-if="!loading && !empty" class="nav-progress">{{ progressText }}</span>
      </template>
    </van-nav-bar>

    <div v-if="loading" class="page-body muted">组卷中…</div>
    <van-empty v-else-if="empty" description="没有可组成的试卷" />

    <template v-else-if="current">
      <div class="page-body">
        <section v-if="result" class="card result-card">
          <p class="result-total">
            <strong>{{ formatScore(result.total) }}</strong>
            <span> / {{ formatScore(result.full) }} 分</span>
          </p>
          <p v-for="row in resultRows" :key="row.type" class="result-line">
            {{ TYPE_LABEL[row.type] }} {{ formatScore(row.score) }} / {{ formatScore(row.full) }} 分
          </p>
          <p class="result-count">
            <span class="ok">对 {{ correctCount }}</span>
            <span class="bad">错 {{ wrongCount }}</span>
          </p>
          <p class="muted">错题已收入错题本，未计入练习进度 · 点题号可跳转</p>
          <div class="sheet-toolbar">
            <button type="button" class="sheet-filter" :class="{ active: !wrongOnly }" @click="setWrongOnly(false)">
              全部
            </button>
            <button type="button" class="sheet-filter" :class="{ active: wrongOnly }" @click="setWrongOnly(true)">
              只看错题
            </button>
          </div>
          <div class="sheet-grid" :class="{ 'wrong-focus': wrongOnly }">
            <button
              v-for="item in sheetItems"
              :key="item.no"
              type="button"
              class="sheet-btn"
              :class="{ ok: item.correct, bad: !item.correct, current: item.index === index }"
              @click="goTo(item.index)"
            >
              {{ item.no }}
            </button>
          </div>
        </section>

        <p class="muted meta-line">
          {{ examSummary(rules) }}
          <template v-if="!submitted"> · 已答 {{ answeredCount }} / {{ total }}</template>
        </p>
        <van-progress
          :percentage="total ? ((index + 1) / total) * 100 : 0"
          stroke-width="4"
          color="#2d6a4f"
          track-color="#e6e1d6"
          :show-pivot="false"
        />
        <p v-if="currentScore != null" class="muted score-line">
          {{ TYPE_LABEL[current.type] }} · {{ formatScore(currentScore) }} 分
        </p>
        <QuestionCard
          class="q-wrap"
          :question="current"
          :selected="selected"
          :submitted="submitted"
          :is-correct="isCorrect"
          :allow-ai="submitted"
          @toggle="toggleOption"
        />
      </div>

      <div class="exam-bar" :class="{ review: submitted }">
        <van-button round :disabled="!canPrev" @click="prev()">上一题</van-button>
        <van-button
          v-if="!submitted"
          round
          type="primary"
          :loading="submitting"
          @click="onSubmitPaper"
        >
          交卷
        </van-button>
        <van-button round :disabled="!canNext" @click="next()">下一题</van-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.exam-page {
  padding-bottom: 0;
}

.nav-progress {
  font-size: 13px;
  color: var(--muted);
}

.meta-line,
.score-line {
  margin: 0 0 10px;
  line-height: 1.5;
}

.score-line {
  margin: 10px 0 0;
}

.q-wrap {
  margin-top: 14px;
}

.result-card {
  margin-bottom: 14px;
}

.result-total {
  margin: 0 0 8px;
  font-size: 15px;
}

.result-total strong {
  font-size: 28px;
  color: var(--primary);
}

.result-line {
  margin: 0 0 4px;
  font-size: 14px;
}

.result-count {
  display: flex;
  gap: 14px;
  margin: 10px 0 8px;
  font-size: 15px;
  font-weight: 700;
}

.result-count .ok {
  color: var(--ok);
}

.result-count .bad {
  color: var(--danger);
}

.sheet-toolbar {
  display: flex;
  gap: 8px;
  margin: 10px 0 12px;
}

.sheet-filter {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fbfaf6;
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}

.sheet-filter.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.sheet-grid.wrong-focus .sheet-btn.ok {
  opacity: 0.35;
}

.sheet-btn {
  height: 36px;
  border: 0;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
}

.sheet-btn.ok {
  background: #e9f5ee;
  color: var(--ok);
}

.sheet-btn.bad {
  background: #fdecea;
  color: var(--danger);
}

.sheet-btn.current {
  box-shadow: 0 0 0 2px var(--ink);
}

.exam-bar {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1.3fr 1fr;
  gap: 8px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: var(--tea-bar);
  backdrop-filter: blur(8px);
}

.exam-bar.review {
  grid-template-columns: 1fr 1fr;
}
</style>
