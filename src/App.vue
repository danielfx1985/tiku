<script setup lang="ts">
import { RouterView } from 'vue-router'

const themeVars = {
  primaryColor: '#2d6a4f',
  buttonPrimaryBackground: '#2d6a4f',
  buttonPrimaryBorderColor: '#2d6a4f',
  navBarBackground: 'rgba(243, 239, 228, 0.86)',
}
</script>

<template>
  <van-config-provider :theme-vars="themeVars">
    <div class="app-shell">
      <RouterView />
    </div>
  </van-config-provider>
</template>
