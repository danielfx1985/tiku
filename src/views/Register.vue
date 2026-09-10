<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { ApiError } from '../api'
import { register } from '../authApi'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)

async function onSubmit() {
  if (!username.value.trim() || password.value.length < 6) {
    showToast('用户名必填，密码至少 6 位')
    return
  }
  loading.value = true
  try {
    await register(username.value.trim(), password.value)
    router.replace('/')
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="注册" left-arrow @click-left="router.back()" />
    <div class="page-body">
      <p class="muted intro">注册后即可导入共用题库，练习进度只属于你自己。</p>
      <van-field v-model="username" label="用户名" placeholder="中文、字母、数字或下划线" maxlength="20" />
      <van-field v-model="password" type="password" label="密码" placeholder="至少 6 位" @keyup.enter="onSubmit" />
      <van-button class="submit" type="primary" block round :loading="loading" @click="onSubmit">注册并登录</van-button>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin: 0 0 16px;
  line-height: 1.6;
}

.submit {
  margin-top: 20px;
}
</style>
