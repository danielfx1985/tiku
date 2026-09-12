<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import type { Question } from '../types'
import { TYPE_LABEL } from '../types'
import { ApiError } from '../api'
import { explainQuestion, getAiStatus } from '../db'

const props = defineProps<{
  question: Question
  selected: string[]
  submitted: boolean
  isCorrect?: boolean
  allowAi?: boolean
}>()

const emit = defineEmits<{
  toggle: [label: string]
}>()

const answerText = computed(() => props.question.answer.join(''))
const cache = ref<Record<string, string>>({})
const aiReady = ref(false)
const sheetOpen = ref(false)
const explaining = ref(false)
const explainError = ref('')
const explanation = ref('')

async function refreshAiStatus() {
  try {
    const status = await getAiStatus()
    aiReady.value = status.enabled
  } catch {
    aiReady.value = false
  }
}

onMounted(() => {
  if (props.allowAi) void refreshAiStatus()
})

watch(
  () => props.allowAi,
  (allow) => {
    if (allow) void refreshAiStatus()
  },
)

watch(
  () => props.question.id,
  () => {
    sheetOpen.value = false
    explainError.value = ''
    explanation.value = cache.value[props.question.id] || ''
  },
)

function optionClass(label: string) {
  const chosen = props.selected.includes(label)
  const isAnswer = props.question.answer.includes(label)
  if (!props.submitted) return chosen ? 'option-item selected' : 'option-item'
  if (isAnswer) return 'option-item correct'
  if (chosen) return 'option-item wrong'
  return 'option-item'
}

function judgeClass(label: string) {
  const chosen = props.selected.includes(label)
  const isAnswer = props.question.answer.includes(label)
  if (!props.submitted) return chosen ? 'judge-btn selected' : 'judge-btn'
  if (isAnswer) return 'judge-btn correct'
  if (chosen) return 'judge-btn wrong'
  return 'judge-btn'
}

async function loadExplanation(force = false) {
  const questionId = props.question.id
  if (!force && cache.value[questionId]) {
    explanation.value = cache.value[questionId]
    explainError.value = ''
    return
  }
  explaining.value = true
  explainError.value = ''
  try {
    const data = await explainQuestion(questionId)
    cache.value = { ...cache.value, [questionId]: data.explanation }
    explanation.value = data.explanation
  } catch (error) {
    explainError.value = error instanceof ApiError ? error.message : '讲解失败'
  } finally {
    explaining.value = false
  }
}

async function openAi() {
  if (!props.allowAi) return
  await refreshAiStatus()
  if (!aiReady.value) {
    showToast('管理员尚未配置 AI')
    return
  }
  sheetOpen.value = true
  explanation.value = cache.value[props.question.id] || ''
  await loadExplanation()
}

async function retryExplain() {
  await loadExplanation(true)
}
</script>

<template>
  <article class="q-card">
    <div class="q-meta">
      <van-tag :type="question.type === 'multi' ? 'warning' : question.type === 'judge' ? 'success' : 'primary'" round>
        {{ TYPE_LABEL[question.type] }}
      </van-tag>
      <span class="muted">第 {{ question.sourceNo }} 题</span>
      <button v-if="allowAi" type="button" class="ai-btn" @click="openAi">AI 解题</button>
    </div>
    <p class="stem">{{ question.stem }}</p>
    <p v-if="question.type === 'multi'" class="hint">可多选，选完后点提交</p>

    <div v-if="question.type === 'judge'" class="judge-row">
      <button type="button" :class="judgeClass('正确')" :disabled="submitted" @click="emit('toggle', '正确')">正确</button>
      <button type="button" :class="judgeClass('错误')" :disabled="submitted" @click="emit('toggle', '错误')">错误</button>
    </div>

    <div v-else class="option-list">
      <button
        v-for="option in question.options"
        :key="option.label"
        type="button"
        :class="optionClass(option.label)"
        :disabled="submitted"
        @click="emit('toggle', option.label)"
      >
        <span class="opt-label">{{ option.label }}</span>
        <span class="opt-text">{{ option.text }}</span>
      </button>
    </div>

    <div v-if="submitted" class="result" :class="isCorrect ? 'ok' : 'bad'">
      <strong>{{ isCorrect ? '回答正确' : '回答错误' }}</strong>
      <p>正确答案：{{ question.type === 'judge' ? question.answer[0] : answerText }}</p>
      <p v-if="question.analysis">解析：{{ question.analysis }}</p>
    </div>

    <van-popup v-model:show="sheetOpen" position="bottom" round>
      <div class="ai-sheet">
        <h3>AI 解题</h3>
        <div v-if="explaining" class="ai-loading">
          <van-loading size="22px" color="#2d6a4f" />
          <span>正在讲解…</span>
        </div>
        <template v-else>
          <p v-if="explainError" class="ai-error">{{ explainError }}</p>
          <p v-else-if="explanation" class="ai-text">{{ explanation }}</p>
          <p v-else class="muted">暂无讲解</p>
          <van-button block round type="primary" @click="retryExplain">
            {{ explanation ? '重新讲解' : '再试一次' }}
          </van-button>
        </template>
      </div>
    </van-popup>
  </article>
</template>

<style scoped>
.q-card {
  background: var(--card);
  border-radius: 18px;
  padding: 18px 16px 20px;
  box-shadow: 0 10px 28px rgba(31, 42, 36, 0.05);
}

.q-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.ai-btn {
  margin-left: auto;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.stem {
  margin: 0 0 14px;
  font-size: 17px;
  line-height: 1.65;
  font-weight: 600;
}

.hint {
  margin: -6px 0 12px;
  color: var(--warn);
  font-size: 13px;
}

.judge-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.judge-btn,
.option-item {
  min-height: 52px;
  border: 1px solid var(--line);
  background: #fbfaf6;
  border-radius: 14px;
  font-size: 16px;
  color: var(--ink);
}

.judge-btn {
  font-weight: 700;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  padding: 12px;
}

.opt-label {
  flex: 0 0 28px;
  height: 28px;
  border-radius: 50%;
  background: #ece8dc;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 14px;
}

.opt-text {
  flex: 1;
  line-height: 1.5;
  padding-top: 3px;
}

.selected {
  border-color: var(--primary);
  background: #e9f5ee;
}

.selected .opt-label {
  background: var(--primary);
  color: #fff;
}

.correct {
  border-color: var(--ok);
  background: #e9f5ee;
}

.wrong {
  border-color: var(--danger);
  background: #fdecea;
}

.result {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
}

.result p {
  margin: 6px 0 0;
}

.result.ok {
  background: #e9f5ee;
  color: var(--ok);
}

.result.bad {
  background: #fdecea;
  color: var(--danger);
}

.ai-sheet {
  padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
}

.ai-sheet h3 {
  margin: 0 0 12px;
  font-size: 17px;
}

.ai-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 14px;
  min-height: 80px;
}

.ai-text {
  margin: 0 0 16px;
  white-space: pre-wrap;
  line-height: 1.7;
  font-size: 14px;
  color: var(--ink);
  max-height: 52vh;
  overflow: auto;
}

.ai-error {
  margin: 0 0 16px;
  color: var(--danger);
  font-size: 14px;
  line-height: 1.6;
}

button:disabled {
  opacity: 1;
}
</style>
