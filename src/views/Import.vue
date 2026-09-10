<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { ApiError } from '../api'
import { getUser } from '../auth'
import { importBank } from '../db'
import { mergeParseResults, parseQuestionText, readTextFile } from '../parser/questionParser'
import type { ParseResult } from '../types'

const router = useRouter()
const bankName = ref('')
const fileNames = ref<string[]>([])
const preview = ref<ParseResult | null>(null)
const importing = ref(false)
const isAdminUser = getUser()?.role === 'admin'
const visibilityHint = isAdminUser
  ? '你是管理员，导入后所有人都能练习这套题。'
  : '这套题导入后只有你自己能看见、能练习。'

const canImport = computed(() => preview.value && preview.value.questions.length > 0 && bankName.value.trim())

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  if (!files.length) return

  fileNames.value = files.map((file) => file.name)
  if (!bankName.value) {
    bankName.value = files[0].name.replace(/\.txt$/i, '')
  }

  const results = []
  for (const file of files) {
    const text = await readTextFile(file)
    results.push(parseQuestionText(text))
  }
  preview.value = mergeParseResults(results)
  input.value = ''
}

async function loadSample() {
  const text = await fetch(`${import.meta.env.BASE_URL}sample-questions.txt`).then((res) => res.text())
  fileNames.value = ['sample-questions.txt']
  if (!bankName.value) bankName.value = '示例题库'
  preview.value = parseQuestionText(text)
}

async function confirmImport() {
  if (!preview.value || !canImport.value) return
  importing.value = true
  try {
    const count = preview.value.questions.length
    await importBank(bankName.value.trim(), preview.value.questions, preview.value.counts.skipped)
    showToast(isAdminUser ? `已导入全员题库 ${count} 题` : `已导入私有题库 ${count} 题`)
    router.replace('/')
  } catch (error) {
    console.error(error)
    showToast(error instanceof ApiError ? error.message : '导入失败，请重试')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="导入题库" left-arrow @click-left="router.back()" />
    <div class="page-body">
      <p class="muted intro">
        {{ visibilityHint }} 支持判断题、单选题、多选题混排 TXT。题头格式：<code>题号、【单选题】题干</code>，选项
        <code>A、</code>，答案行 <code>答案：D</code> 或 <code>答案：ABCD</code>。
      </p>

      <van-field v-model="bankName" label="题库名称" placeholder="例如：茶学基础" />

      <label class="pick">
        选择 TXT 文件（可多选）
        <input type="file" accept=".txt,text/plain" multiple @change="onPick" />
      </label>
      <button type="button" class="sample-btn" @click="loadSample">加载示例题（9 题）</button>
      <p v-if="fileNames.length" class="muted">已选：{{ fileNames.join('、') }}</p>

      <template v-if="preview">
        <div class="card counts">
          <div><strong>{{ preview.counts.judge }}</strong><span>判断</span></div>
          <div><strong>{{ preview.counts.single }}</strong><span>单选</span></div>
          <div><strong>{{ preview.counts.multi }}</strong><span>多选</span></div>
          <div><strong>{{ preview.counts.skipped }}</strong><span>跳过</span></div>
        </div>

        <div v-if="preview.errors.length" class="card errors">
          <h3>未入库 {{ preview.errors.length }} 题</h3>
          <p v-for="(item, i) in preview.errors.slice(0, 20)" :key="i">
            {{ item.sourceNo || '未知' }}：{{ item.reason }}
            <span v-if="item.stem">（{{ item.stem.slice(0, 24) }}）</span>
          </p>
          <p v-if="preview.errors.length > 20" class="muted">其余 {{ preview.errors.length - 20 }} 条已省略</p>
        </div>

        <van-button type="primary" block round :disabled="!canImport" :loading="importing" @click="confirmImport">
          确认导入 {{ preview.questions.length }} 题
        </van-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin: 0 0 14px;
  line-height: 1.6;
}

code {
  font-size: 12px;
  background: #ece8dc;
  padding: 1px 4px;
  border-radius: 4px;
}

.pick {
  display: block;
  margin: 14px 0 8px;
  background: var(--primary);
  color: #fff;
  text-align: center;
  border-radius: 14px;
  min-height: 48px;
  line-height: 48px;
  font-weight: 700;
  position: relative;
}

.pick input {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.sample-btn {
  display: block;
  width: 100%;
  margin-top: 10px;
  min-height: 44px;
  border: 1px dashed var(--primary);
  background: transparent;
  color: var(--primary);
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
}

.counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  text-align: center;
  margin: 16px 0;
}

.counts strong {
  display: block;
  font-size: 22px;
}

.counts span {
  color: var(--muted);
  font-size: 12px;
}

.errors h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.errors p {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--danger);
}

.van-button {
  margin-top: 16px;
}
</style>
