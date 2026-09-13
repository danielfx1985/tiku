<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { api, ApiError } from '../api'
import { getToken, getUser, setAuth, clearAuth, type AuthUser } from '../auth'
import { deleteBank, getHomeStats, listBanks } from '../db'
import {
  examSummary,
  EXAM_TYPE_ORDER,
  loadSavedExamRules,
  rulesToQuery,
  saveExamRules,
  validateExamRules,
} from '../examConfig'
import type { ExamRule, HomeStats, QuestionBank, QuestionType } from '../types'
import { TYPE_LABEL } from '../types'

const BATCH_OPTIONS = [20, 50, 100] as const

const router = useRouter()
const stats = ref<HomeStats>({
  total: 0,
  practiced: 0,
  unanswered: 0,
  correct: 0,
  accuracy: 0,
  wrong: 0,
  byType: { judge: 0, single: 0, multi: 0 },
})
const banks = ref<QuestionBank[]>([])
const random = ref(true)
const batchSize = ref<(typeof BATCH_OPTIONS)[number]>(50)
const activeBankId = ref<string>('')
const user = ref<AuthUser | null>(getUser())
const examOpen = ref(false)
const examRules = ref<ExamRule[]>(loadSavedExamRules())

const examPreview = computed(() => examSummary(examRules.value))
const availableByType = computed(() => stats.value.byType)

async function refresh() {
  try {
    stats.value = await getHomeStats(activeBankId.value || undefined)
    banks.value = await listBanks()
    if (activeBankId.value && !banks.value.some((item) => item.id === activeBankId.value)) {
      activeBankId.value = ''
      stats.value = await getHomeStats()
    }
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '加载失败')
  }
}

onMounted(async () => {
  try {
    const data = await api<{ user: AuthUser }>('/auth/me')
    setAuth(getToken(), data.user)
    user.value = data.user
  } catch {
    // keep cached user
  }
  await refresh()
})

function goPractice(query: Record<string, string>) {
  if (!stats.value.total) {
    showToast('请先导入题库')
    return
  }
  router.push({
    name: 'practice',
    query: {
      ...query,
      batch: String(batchSize.value),
      ...(activeBankId.value ? { bankId: activeBankId.value } : {}),
      random: random.value ? '1' : '0',
    },
  })
}

function startUnanswered(type?: QuestionType) {
  if (type && !stats.value.byType[type]) {
    showToast(`还没有${TYPE_LABEL[type]}`)
    return
  }
  if (!stats.value.unanswered) {
    showToast('没有未做题目，可复习全部')
    return
  }
  goPractice({
    unanswered: '1',
    ...(type ? { type } : {}),
  })
}

function startReview(type?: QuestionType) {
  if (type && !stats.value.byType[type]) {
    showToast(`还没有${TYPE_LABEL[type]}`)
    return
  }
  goPractice(type ? { type } : {})
}

function startWrong() {
  if (!stats.value.wrong) {
    showToast('暂无错题')
    return
  }
  goPractice({ wrong: '1' })
}

function openExamConfig() {
  if (!stats.value.total) {
    showToast('请先导入题库')
    return
  }
  examRules.value = loadSavedExamRules()
  examOpen.value = true
}

function setExamCount(type: QuestionType, raw: string) {
  examRules.value = examRules.value.map((item) =>
    item.type === type ? { ...item, count: raw === '' ? 0 : Number(raw) } : item,
  )
}

function setExamScore(type: QuestionType, raw: string) {
  examRules.value = examRules.value.map((item) =>
    item.type === type ? { ...item, score: raw === '' ? 0 : Number(raw) } : item,
  )
}

function startExam() {
  const error = validateExamRules(examRules.value, availableByType.value)
  if (error) {
    showToast(error)
    return
  }
  saveExamRules(examRules.value)
  examOpen.value = false
  router.push({
    name: 'exam',
    query: {
      ...rulesToQuery(examRules.value),
      ...(activeBankId.value ? { bankId: activeBankId.value } : {}),
    },
  })
}

async function removeBank(bank: QuestionBank) {
  try {
    await showConfirmDialog({
      title: '删除题库',
      message: `确定删除「${bank.name}」及其中全部题目、相关错题吗？`,
    })
  } catch {
    return
  }
  try {
    await deleteBank(bank.id)
    showToast('已删除')
    await refresh()
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '删除失败')
  }
}

function logout() {
  clearAuth()
  router.replace('/login')
}

async function selectBank(id: string) {
  activeBankId.value = activeBankId.value === id ? '' : id
  stats.value = await getHomeStats(activeBankId.value || undefined)
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="芮淋家茶习题库">
      <template v-if="user?.role === 'admin'" #left>
        <button type="button" class="logout" @click="router.push('/settings')">设置</button>
      </template>
      <template #right>
        <button type="button" class="logout" @click="logout">退出</button>
      </template>
    </van-nav-bar>
    <div class="page-body">
      <section class="hero card">
        <p class="hello">
          {{ user?.username || '学员' }}
          <span v-if="user?.role === 'admin'" class="role-tag">管理员</span>
          · 进度已按账号保存
        </p>
        <div class="stat-grid">
          <div>
            <strong>{{ stats.unanswered }}</strong>
            <span>未做</span>
          </div>
          <div>
            <strong>{{ stats.practiced }}</strong>
            <span>已练</span>
          </div>
          <div>
            <strong>{{ stats.accuracy }}%</strong>
            <span>正确率</span>
          </div>
          <div>
            <strong>{{ stats.wrong }}</strong>
            <span>错题</span>
          </div>
        </div>
        <div class="type-line muted">
          共 {{ stats.total }} 题 · 判断 {{ stats.byType.judge }} · 单选 {{ stats.byType.single }} · 多选
          {{ stats.byType.multi }}
        </div>
      </section>

      <h2 class="section-title">开始练习</h2>
      <div class="card">
        <div class="batch-row">
          <span>每轮题量</span>
          <div class="batch-pills">
            <button
              v-for="size in BATCH_OPTIONS"
              :key="size"
              type="button"
              class="pill"
              :class="{ active: batchSize === size }"
              @click="batchSize = size"
            >
              {{ size }}
            </button>
          </div>
        </div>
        <label class="random-row">
          <span>随机顺序</span>
          <van-switch v-model="random" size="22px" active-color="#2d6a4f" />
        </label>
        <button type="button" class="mode-btn primary" @click="startUnanswered()">
          刷未做题
          <small>{{ stats.unanswered }} 题待练</small>
        </button>
        <div class="mode-grid">
          <button type="button" class="mode-btn" @click="startUnanswered('judge')">判断未做</button>
          <button type="button" class="mode-btn" @click="startUnanswered('single')">单选未做</button>
          <button type="button" class="mode-btn" @click="startUnanswered('multi')">多选未做</button>
          <button type="button" class="mode-btn" @click="startReview()">全部复习</button>
        </div>
        <div class="exam-entry">
          <button type="button" class="mode-btn" @click="openExamConfig">生成模拟试卷</button>
          <button type="button" class="mode-btn" @click="router.push({ name: 'exams' })">模拟记录</button>
        </div>
      </div>

      <div class="action-grid">
        <button type="button" class="action-btn" @click="startWrong">
          错题练习
          <small>{{ stats.wrong }} 题</small>
        </button>
        <button type="button" class="action-btn ghost" @click="router.push('/wrong')">错题库</button>
        <button type="button" class="action-btn primary" @click="router.push('/import')">导入题库</button>
      </div>

      <van-popup v-model:show="examOpen" position="bottom" round>
        <div class="exam-sheet">
          <h3>模拟试卷</h3>
          <p class="muted exam-preview">{{ examPreview }}</p>
          <p class="muted">
            可改题量和每题分值；当前范围：判断 {{ stats.byType.judge }} · 单选 {{ stats.byType.single }} · 多选
            {{ stats.byType.multi }}
          </p>
          <div class="exam-row exam-head muted">
            <span>题型</span>
            <span>题量</span>
            <span>每题分</span>
          </div>
          <div v-for="type in EXAM_TYPE_ORDER" :key="type" class="exam-row">
            <span>{{ TYPE_LABEL[type] }}</span>
            <van-field
              :model-value="String(examRules.find((item) => item.type === type)?.count ?? 0)"
              type="digit"
              input-align="center"
              placeholder="题量"
              @update:model-value="(value) => setExamCount(type, value)"
            />
            <van-field
              :model-value="String(examRules.find((item) => item.type === type)?.score ?? 0)"
              type="number"
              input-align="center"
              placeholder="分值"
              @update:model-value="(value) => setExamScore(type, value)"
            />
          </div>
          <van-button class="exam-start" type="primary" block round @click="startExam">开始组卷</van-button>
        </div>
      </van-popup>

      <h2 class="section-title">题库{{ activeBankId ? '（已选题库，练习仅此套）' : '' }}</h2>
      <p class="muted bank-hint">管理员导入的题库全员可用；你自己导入的只自己能看见。</p>
      <van-empty v-if="!banks.length" description="还没有题库，先导入 TXT" />
      <div v-else class="bank-list">
        <article
          v-for="bank in banks"
          :key="bank.id"
          class="card bank-card"
          :class="{ active: activeBankId === bank.id }"
          @click="selectBank(bank.id)"
        >
          <div class="bank-head">
            <strong>{{ bank.name }}</strong>
            <span class="badge" :class="bank.isPublic ? 'public' : 'private'">
              {{ bank.isPublic ? '全员' : '仅自己' }}
            </span>
            <button v-if="bank.canDelete" type="button" class="link-btn" @click.stop="removeBank(bank)">删除</button>
          </div>
          <p class="muted">
            判断 {{ bank.counts.judge }} · 单选 {{ bank.counts.single }} · 多选 {{ bank.counts.multi }}
            <template v-if="bank.counts.skipped"> · 跳过 {{ bank.counts.skipped }}</template>
          </p>
          <p v-if="bank.importedByName" class="muted">导入者：{{ bank.importedByName }}</p>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  background:
    radial-gradient(80% 90% at 92% 0%, rgba(255, 255, 255, 0.2), transparent 52%),
    linear-gradient(160deg, #1b4332, #2d6a4f 55%, #40916c);
  color: #fff;
}

.hello {
  margin: 0 0 14px;
  opacity: 0.86;
  font-size: 13px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  text-align: center;
}

.stat-grid strong {
  display: block;
  font-size: 22px;
}

.stat-grid span,
.type-line {
  font-size: 12px;
  opacity: 0.86;
}

.type-line {
  margin-top: 12px;
  color: #fff !important;
}

.batch-row,
.random-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 15px;
}

.batch-pills {
  display: flex;
  gap: 8px;
}

.pill {
  min-width: 44px;
  height: 32px;
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

.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.mode-btn,
.action-btn,
.link-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: 0;
  background: #f3efe4;
  color: var(--ink);
  border-radius: 12px;
  min-height: 48px;
  font-size: 15px;
  font-weight: 700;
}

.mode-btn.primary {
  width: 100%;
  background: var(--primary);
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 56px;
}

.mode-btn.primary small {
  font-weight: 500;
  opacity: 0.88;
  margin-top: 2px;
}

.exam-entry {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.exam-sheet {
  padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
}

.exam-sheet h3 {
  margin: 0 0 8px;
  font-size: 17px;
}

.exam-preview {
  margin: 0 0 8px;
  line-height: 1.5;
}

.exam-row {
  display: grid;
  grid-template-columns: 72px 1fr 1fr;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.exam-head {
  font-size: 12px;
  text-align: center;
}

.exam-head span:first-child,
.exam-row > span:first-child {
  text-align: left;
}

.exam-row :deep(.van-field) {
  padding: 6px 8px;
  background: #fbfaf6;
  border-radius: 10px;
}

.exam-start {
  margin-top: 16px;
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 16px;
}

.action-btn {
  background: #fff;
  box-shadow: 0 8px 24px rgba(31, 42, 36, 0.04);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.action-btn small {
  font-weight: 500;
  color: var(--muted);
  margin-top: 2px;
}

.action-btn.primary {
  grid-column: 1 / -1;
  background: var(--primary);
  color: #fff;
}

.action-btn.ghost {
  background: #fff;
}

.bank-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bank-card.active {
  outline: 2px solid var(--primary);
}

.bank-hint {
  margin: -4px 0 10px;
}

.role-tag,
.badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.role-tag {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.badge.public {
  background: #e9f5ee;
  color: var(--primary);
}

.badge.private {
  background: #ece8dc;
  color: var(--muted);
}

.bank-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.bank-head strong {
  flex: 1;
}

.link-btn {
  background: transparent;
  color: var(--danger);
  min-height: auto;
  font-size: 13px;
  font-weight: 600;
}

.logout {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 14px;
}
</style>
