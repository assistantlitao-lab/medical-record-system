<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'

const themeStore = useThemeStore()
const authStore = useAuthStore()

onMounted(() => {
  // 初始化主题
  themeStore.init()
  // 检查登录状态并初始化会话
  authStore.checkAuth()
})
</script>

<template>
  <RouterView />
</template>

<style>
@import './assets/base.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--color-text);
  background: var(--color-background);
}

#app {
  min-height: 100vh;
}

/* 通用组件样式支持黑暗模式 */
.card {
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
}

.btn {
  background: var(--color-btn-bg);
  border: 1px solid var(--color-btn-border);
  color: var(--color-btn-text);
}

.input {
  background: var(--color-input-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.modal-content {
  background: var(--color-modal-bg);
  border: 1px solid var(--color-border);
}
</style>
