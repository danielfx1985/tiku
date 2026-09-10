<script setup lang="ts">
import { computed } from 'vue'
import type { Question } from '../types'
import { TYPE_LABEL } from '../types'

const props = defineProps<{
  question: Question
  selected: string[]
  submitted: boolean
  isCorrect?: boolean
}>()

const emit = defineEmits<{
  toggle: [label: string]
}>()

const answerText = computed(() => props.question.answer.join(''))

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
</script>

<template>
  <article class="q-card">
    <div class="q-meta">
      <van-tag :type="question.type === 'multi' ? 'warning' : question.type === 'judge' ? 'success' : 'primary'" round>
        {{ TYPE_LABEL[question.type] }}
      </van-tag>
      <span class="muted">第 {{ question.sourceNo }} 题</span>
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

button:disabled {
  opacity: 1;
}
</style>
