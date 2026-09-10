<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { ApiError } from '../api'
import { login } from '../authApi'

const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const loading = ref(false)

async function onSubmit() {
  if (!username.value.trim() || !password.value) {
    showToast('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await login(username.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  } catch (error) {
    showToast(error instanceof ApiError ? error.message : '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="登录" />
    <div class="page-body">
      <p class="muted intro">每人一个账号，进度和错题云端分开保存。</p>
      <van-field v-model="username" label="用户名" placeholder="2-20 位" maxlength="20" />
      <van-field v-model="password" type="password" label="密码" placeholder="至少 6 位" @keyup.enter="onSubmit" />
      <van-button class="submit" type="primary" block round :loading="loading" @click="onSubmit">登录</van-button>
      <button type="button" class="link" @click="router.push('/register')">没有账号？去注册</button>
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

.link {
  display: block;
  width: 100%;
  margin-top: 16px;
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 14px;
}
</style>
