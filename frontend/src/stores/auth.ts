import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useRouter } from 'vue-router'
import { login as loginApi, type LoginParams } from '@/api/auth'

const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30分钟
const HEARTBEAT_INTERVAL = 5 * 60 * 1000 // 5分钟发送一次心跳

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<any>(null)

  // 无操作超时相关
  let inactivityTimer: number | null = null
  let heartbeatTimer: number | null = null

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => !!user.value?.isAdmin)

  // 重置无操作计时器
  function resetInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer)
    }

    if (token.value) {
      inactivityTimer = window.setTimeout(() => {
        // 无操作超时，自动登出
        console.warn('无操作超时，自动登出')
        logout(true)
      }, INACTIVITY_TIMEOUT)
    }
  }

  // 发送心跳
  async function sendHeartbeat() {
    if (!token.value) return

    try {
      await fetch('/api/v1/auth/heartbeat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.value}`,
          'Content-Type': 'application/json'
        }
      })
    } catch (error) {
      // 心跳失败不影响用户体验
      console.warn('心跳失败:', error)
    }
  }

  // 启动心跳
  function startHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
    }

    if (token.value) {
      heartbeatTimer = window.setInterval(() => {
        sendHeartbeat()
      }, HEARTBEAT_INTERVAL)
    }
  }

  // 停止心跳
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  // 监听用户活动
  function initInactivityListener() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove']

    events.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true })
    })
  }

  // 初始化（登录后调用）
  function initSession() {
    resetInactivityTimer()
    startHeartbeat()
    initInactivityListener()
  }

  // 清理会话（登出时调用）
  function cleanupSession() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer)
      inactivityTimer = null
    }
    stopHeartbeat()
  }

  async function login(data: LoginParams) {
    const res = await loginApi(data)
    token.value = res.data.token
    user.value = {
      id: res.data.user_id,
      name: res.data.name,
      isAdmin: res.data.is_admin
    }
    localStorage.setItem('token', res.data.token)

    // 初始化会话
    initSession()

    return res
  }

  function logout(autoLogout = false) {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')

    // 清理会话
    cleanupSession()

    // 提示信息
    if (autoLogout) {
      alert('登录已过期，请重新登录')
    }

    // 跳转到登录页
    window.location.href = '/login'
  }

  // 检查登录状态（页面刷新时调用）
  function checkAuth() {
    if (token.value) {
      initSession()
    }
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    login,
    logout,
    checkAuth,
    initSession,
    resetInactivityTimer
  }
})
