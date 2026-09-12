<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { ApiError } from '../api'
import { getAiSettings, saveAiSettings } from '../db'

const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const enabled = ref(false)
const baseUrl = ref('')
const apiKey = ref('')
const model = ref('')
const systemPrompt = ref('')
const apiKeySet = ref(false)
const apiKeyMasked = ref('')

onMounted(async () => {
  try {
    const settings = await getAiSettings()
    enabled.value = settings.enabled
    baseUrl.value = settings.baseUrl
    model.value = settings.model
    systemPrompt.value = settings.systemPrompt
    apiKeySet.value = settings.apiKeySet
    apiKeyMasked.value = settings.apiKeyMasked
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '加载设置失败')
    if (error instanceof ApiError && error.status === 403) router.replace('/')
  } finally {
    loading.value = false
  }
})

async function onSave() {
  saving.value = true
  try {
    const settings = await saveAiSettings({
      enabled: enabled.value,
      baseUrl: baseUrl.value.trim(),
      model: model.value.trim(),
      systemPrompt: systemPrompt.value.trim(),
      ...(apiKey.value.trim() ? { apiKey: apiKey.value.trim() } : {}),
    })
    enabled.value = settings.enabled
    baseUrl.value = settings.baseUrl
    model.value = settings.model
    systemPrompt.value = settings.systemPrompt
    apiKeySet.value = settings.apiKeySet
    apiKeyMasked.value = settings.apiKeyMasked
    apiKey.value = ''
    showToast('已保存')
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="AI 设置" left-arrow @click-left="router.back()" />
    <div v-if="loading" class="page-body muted">加载中…</div>
    <div v-else class="page-body">
      <p class="muted intro">
        配置 OpenAI 兼容接口后，练习题可使用「AI 解题」。API Key 只保存在服务器，学员无法查看。
      </p>

      <label class="switch-row">
        <span>启用 AI 解题</span>
        <van-switch v-model="enabled" size="22px" active-color="#2d6a4f" />
      </label>

      <van-field
        v-model="baseUrl"
        label="Base URL"
        placeholder="https://api.deepseek.com/v1"
        autocomplete="off"
      />
      <van-field v-model="model" label="模型" placeholder="deepseek-chat" autocomplete="off" />
      <van-field
        v-model="apiKey"
        type="password"
        label="API Key"
        :placeholder="apiKeySet ? `已保存 ${apiKeyMasked}，留空不改` : '尚未设置'"
        autocomplete="off"
      />
      <van-field
        v-model="systemPrompt"
        type="textarea"
        rows="6"
        autosize
        label="System Prompt"
        placeholder="讲解角色与要求"
      />

      <van-button class="submit" type="primary" block round :loading="saving" @click="onSave">
        保存设置
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin: 0 0 16px;
  line-height: 1.6;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 12px 16px;
  background: var(--card);
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
}

.submit {
  margin-top: 20px;
}
</style>
