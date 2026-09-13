<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { ApiError } from '../api'
import { listExams, removeExam } from '../db'
import { formatScore } from '../examConfig'
import type { ExamRecordSummary } from '../types'

const router = useRouter()
const loading = ref(true)
const items = ref<ExamRecordSummary[]>([])

async function refresh() {
  items.value = await listExams()
}

onMounted(async () => {
  try {
    await refresh()
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '加载失败')
  } finally {
    loading.value = false
  }
})

function formatTime(value: number) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function openExam(id: string) {
  router.push({ name: 'exam', query: { id } })
}

async function removeItem(id: string) {
  try {
    await showConfirmDialog({
      title: '删除记录',
      message: '确定删除这条模拟记录吗？删除后无法回看。',
    })
  } catch {
    return
  }
  try {
    await removeExam(id)
    items.value = items.value.filter((item) => item.id !== id)
    showToast('已删除')
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '删除失败')
  }
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="模拟记录" left-arrow @click-left="router.back()" />
    <div class="page-body">
      <div v-if="loading" class="muted">加载中…</div>
      <van-empty v-else-if="!items.length" description="还没有交过模拟卷" />

      <article
        v-for="item in items"
        :key="item.id"
        class="card exam-card"
        @click="openExam(item.id)"
      >
        <div class="row">
          <strong>{{ formatScore(item.total) }} / {{ formatScore(item.full) }} 分</strong>
          <button type="button" class="link-btn" @click.stop="removeItem(item.id)">删除</button>
        </div>
        <p class="muted count">
          {{ formatTime(item.submittedAt) }} · 共 {{ item.totalCount }} 题 · 对 {{ item.correctCount }} · 错
          {{ item.totalCount - item.correctCount }}
        </p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.exam-card {
  margin-bottom: 10px;
  cursor: pointer;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.row strong {
  font-size: 18px;
  color: var(--primary);
}

.link-btn {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--danger);
  font-size: 13px;
}

.count {
  margin: 8px 0 0;
}
</style>
