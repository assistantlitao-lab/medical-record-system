import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { login as loginApi, type LoginParams } from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<any>(null)

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => !!user.value?.is_admin)

  async function login(data: LoginParams) {
    const res = await loginApi(data)
    token.value = res.data.token
    user.value = {
      id: res.data.user_id,
      name: res.data.name,
      is_admin: res.data.is_admin
    }
    localStorage.setItem('token', res.data.token)
    return res
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    login,
    logout
  }
})
