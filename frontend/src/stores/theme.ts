import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark' | 'auto'

export const useThemeStore = defineStore('theme', () => {
  // 从 localStorage 读取主题设置，默认为 auto
  const themeMode = ref<ThemeMode>(localStorage.getItem('themeMode') as ThemeMode || 'light')
  const isDark = ref(false)

  // 应用主题
  function applyTheme() {
    const root = document.documentElement

    if (themeMode.value === 'auto') {
      // 跟随系统
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    } else {
      isDark.value = themeMode.value === 'dark'
    }

    // 添加或移除 dark 类
    if (isDark.value) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  // 设置主题模式
  function setTheme(mode: ThemeMode) {
    themeMode.value = mode
    localStorage.setItem('themeMode', mode)
    applyTheme()
  }

  // 切换主题
  function toggleTheme() {
    if (themeMode.value === 'light') {
      setTheme('dark')
    } else if (themeMode.value === 'dark') {
      setTheme('auto')
    } else {
      setTheme('light')
    }
  }

  // 监听系统主题变化
  function initThemeListener() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (themeMode.value === 'auto') {
        applyTheme()
      }
    })
  }

  // 初始化
  function init() {
    // 强制使用浅色主题，忽略之前保存的设置
    themeMode.value = 'light'
    localStorage.setItem('themeMode', 'light')
    applyTheme()
    initThemeListener()
  }

  return {
    themeMode,
    isDark,
    setTheme,
    toggleTheme,
    init
  }
})
