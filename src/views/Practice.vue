<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import QuestionCard from '../components/QuestionCard.vue'
import { ApiError } from '../api'
import { useQuiz } from '../composables/useQuiz'
import type { QuestionFilter } from '../db'
import type { QuestionType } from '../types'
import { TYPE_LABEL } from '../types'

const route = useRoute()
const router = useRouter()
const {
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
} = useQuiz()

const title = computed(() => {
  if (route.query.wrong === '1') return '错题练习'
  if (route.query.unanswered === '1') return '未做练习'
  const type = route.query.type as QuestionType | undefined
  return type ? TYPE_LABEL[type] : '练习'
})

function parseBatchSize(): number {
  const raw = Number(route.query.batch)
  return Number.isFinite(raw) && raw > 0 ? raw : 50
}

onMounted(async () => {
  const filter: QuestionFilter = {
    bankId: typeof route.query.bankId === 'string' ? route.query.bankId : undefined,
    type: typeof route.query.type === 'string' ? (route.query.type as QuestionType) : undefined,
    wrongOnly: route.query.wrong === '1',
    unansweredOnly: route.query.unanswered === '1',
  }
  try {
    await start(filter, {
      random: route.query.random !== '0',
      batchSize: parseBatchSize(),
    })
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '加载题目失败')
  }
})

async function onSubmit() {
  try {
    const correct = await submit()
    if (correct === undefined) return
    if (correct === false) showToast('已收入错题库')
    if (correct && wrongPractice.value) showToast('已移出错题库')
    if (isLast.value) {
      if (leftover.value > 0) showToast(`本轮完成，还剩 ${leftover.value} 题`)
      else if (unansweredMode.value) showToast('未做题目已全部练完')
      else showToast('本轮已完成')
    }
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '提交失败')
  }
}

function onNext() {
  if (!submitted.value) {
    showToast('请先提交本题')
    return
  }
  if (isLast.value) {
    showToast(leftover.value > 0 ? `本轮已完成，还剩 ${leftover.value} 题` : '已经是最后一题')
    return
  }
  next()
}

async function onContinue() {
  await startNextRound()
  if (empty.value) showToast('没有更多题目了')
}
</script>

<template>
  <div class="page practice-page">
    <van-nav-bar :title="title" left-arrow @click-left="router.back()">
      <template #right>
        <span v-if="!loading && !empty" class="nav-progress">{{ progressText }}</span>
      </template>
    </van-nav-bar>

    <div v-if="loading" class="page-body muted">加载中…</div>
    <van-empty v-else-if="empty" :description="unansweredMode ? '没有未做题目' : '没有可练习的题目'" />

    <template v-else-if="current">
      <div class="page-body">
        <p v-if="leftover > 0" class="muted leftover">本轮 {{ total }} 题，其余 {{ leftover }} 题下一轮再练</p>
        <van-progress
          :percentage="((index + 1) / total) * 100"
          stroke-width="4"
          color="#2d6a4f"
          track-color="#e6e1d6"
          :show-pivot="false"
        />
        <QuestionCard
          class="q-wrap"
          :question="current"
          :selected="selected"
          :submitted="submitted"
          :is-correct="isCorrect"
          allow-ai
          @toggle="toggleOption"
        />
        <van-button
          v-if="roundDone && leftover > 0"
          class="continue-btn"
          type="primary"
          block
          round
          @click="onContinue"
        >
          继续下一轮（还剩 {{ leftover }} 题）
        </van-button>
      </div>

      <div class="practice-bar">
        <van-button round :disabled="index === 0" @click="prev()">上一题</van-button>
        <van-button
          round
          type="primary"
          :disabled="submitted || !canSubmit"
          :loading="submitting"
          @click="onSubmit"
        >
          {{ submitted ? '已判定' : '提交' }}
        </van-button>
        <van-button round :disabled="!canGoNext" @click="onNext">下一题</van-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.practice-page {
  padding-bottom: 0;
}

.nav-progress {
  font-size: 13px;
  color: var(--muted);
}

.leftover {
  margin: 0 0 10px;
}

.q-wrap {
  margin-top: 14px;
}

.continue-btn {
  margin-top: 16px;
}

.practice-bar {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1.3fr 1fr;
  gap: 8px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: var(--tea-bar);
  backdrop-filter: blur(8px);
}
</style>
