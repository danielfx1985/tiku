<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { listWrongItems, removeWrong, type WrongListItem } from '../db'
import { TYPE_LABEL } from '../types'

const router = useRouter()
const items = ref<WrongListItem[]>([])

async function refresh() {
  items.value = await listWrongItems()
}

onMounted(refresh)

function startPractice() {
  if (!items.value.length) {
    showToast('暂无错题')
    return
  }
  router.push({ name: 'practice', query: { wrong: '1' } })
}

async function removeItem(questionId: string) {
  try {
    await showConfirmDialog({ title: '移出错题', message: '确定从错题库移除这道题吗？' })
  } catch {
    return
  }
  await removeWrong(questionId)
  await refresh()
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="错题库" left-arrow @click-left="router.back()" />
    <div class="page-body">
      <van-button v-if="items.length" type="primary" block round @click="startPractice">
        开始错题练习（{{ items.length }}）
      </van-button>

      <van-empty v-if="!items.length" description="暂无错题" />

      <article v-for="item in items" :key="item.question.id" class="card wrong-card">
        <div class="row">
          <van-tag type="danger" round>{{ TYPE_LABEL[item.question.type] }}</van-tag>
          <span class="muted">错 {{ item.record.wrongCount }} 次</span>
          <button type="button" class="link-btn" @click="removeItem(item.question.id)">移除</button>
        </div>
        <p class="stem">{{ item.question.stem }}</p>
        <p class="muted">最近错选：{{ item.record.lastWrongChoice.join('') || '—' }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.van-button {
  margin-bottom: 14px;
}

.wrong-card {
  margin-bottom: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stem {
  margin: 10px 0 6px;
  line-height: 1.55;
  font-weight: 600;
}

.link-btn {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--danger);
  font-size: 13px;
}
</style>
