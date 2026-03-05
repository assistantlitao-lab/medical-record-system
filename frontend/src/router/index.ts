import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/patients',
      name: 'patients',
      component: () => import('@/views/PatientsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/patient/:id',
      name: 'patient-detail',
      component: () => import('@/views/PatientDetailView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/visit/:id',
      name: 'visit-detail',
      component: () => import('@/views/VisitDetailView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    }
  ]
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  // 需要登录但未登录
  if (to.meta.requiresAuth && !authStore.token) {
    next('/login')
    return
  }

  // 已登录但访问登录页
  if (to.path === '/login' && authStore.token) {
    next('/')
    return
  }

  // 需要管理员权限但非管理员
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    alert('您没有管理员权限')
    next('/')
    return
  }

  next()
})

export default router
