<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { listWrongItems, removeWrong, type WrongListItem } from '../db'
import type { QuestionType } from '../types'
import { TYPE_LABEL } from '../types'

const TYPE_ORDER: QuestionType[] = ['judge', 'single', 'multi']

const router = useRouter()
const items = ref<WrongListItem[]>([])
const activeType = ref<QuestionType | ''>('')

const counts = computed(() => {
  const result: Record<QuestionType, number> = { judge: 0, single: 0, multi: 0 }
  for (const item of items.value) result[item.question.type] += 1
  return result
})

const visibleItems = computed(() =>
  activeType.value ? items.value.filter((item) => item.question.type === activeType.value) : items.value,
)

const practiceLabel = computed(() => {
  if (!activeType.value) return `开始错题练习（${items.value.length}）`
  return `开始${TYPE_LABEL[activeType.value]}练习（${visibleItems.value.length}）`
})

const emptyDescription = computed(() => {
  if (!items.value.length) return '暂无错题'
  if (activeType.value) return `暂无${TYPE_LABEL[activeType.value]}错题`
  return '暂无错题'
})

async function refresh() {
  items.value = await listWrongItems()
  if (activeType.value && !counts.value[activeType.value] && items.value.length) {
    activeType.value = ''
  }
}

onMounted(refresh)

function startPractice() {
  if (!visibleItems.value.length) {
    showToast(activeType.value ? `暂无${TYPE_LABEL[activeType.value]}错题` : '暂无错题')
    return
  }
  router.push({
    name: 'practice',
    query: {
      wrong: '1',
      ...(activeType.value ? { type: activeType.value } : {}),
    },
  })
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
      <template v-if="items.length">
        <div class="type-pills">
          <button type="button" class="pill" :class="{ active: activeType === '' }" @click="activeType = ''">
            全部 {{ items.length }}
          </button>
          <button
            v-for="type in TYPE_ORDER"
            :key="type"
            type="button"
            class="pill"
            :class="{ active: activeType === type }"
            :disabled="!counts[type]"
            @click="activeType = type"
          >
            {{ TYPE_LABEL[type].replace('题', '') }} {{ counts[type] }}
          </button>
        </div>
        <van-button type="primary" block round :disabled="!visibleItems.length" @click="startPractice">
          {{ practiceLabel }}
        </van-button>
      </template>

      <van-empty v-if="!visibleItems.length" :description="emptyDescription" />

      <article v-for="item in visibleItems" :key="item.question.id" class="card wrong-card">
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
.type-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.pill {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line);
  background: #fbfaf6;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}

.pill.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.pill:disabled {
  opacity: 0.4;
}

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
