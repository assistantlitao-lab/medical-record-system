<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()

interface TodayStats {
  totalVisits: number
  pendingTranscription: number
  completedRecords: number
}

interface RecentVisit {
  id: string
  patientName: string
  visitNo: string
  visitDate: string
  status: 'draft' | 'editing' | 'completed'
}

const stats = ref<TodayStats>({
  totalVisits: 0,
  pendingTranscription: 0,
  completedRecords: 0
})

const recentVisits = ref<RecentVisit[]>([])
const loading = ref(false)

onMounted(() => {
  loadTodayStats()
  loadRecentVisits()
})

async function loadTodayStats() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/v1/visits?date=${today}`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.code === 200 && Array.isArray(data.data.list)) {
        const visits = data.data.list
        stats.value.totalVisits = visits.length
        stats.value.pendingTranscription = visits.filter((v: any) => v.status === 0).length
        stats.value.completedRecords = visits.filter((v: any) => v.status === 2).length
      }
    }
  } catch (e) {
    console.error('加载统计失败:', e)
  }
}

async function loadRecentVisits() {
  loading.value = true
  try {
    const res = await fetch('/api/v1/visits/recent', {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.code === 200 && Array.isArray(data.data.list)) {
        recentVisits.value = data.data.list.map((v: any) => ({
          id: v.id,
          patientName: v.patient_name,
          visitNo: v.visit_no,
          visitDate: v.visit_date,
          status: v.status === 0 ? 'draft' : v.status === 1 ? 'editing' : 'completed'
        }))
      }
    }
  } catch (e) {
    console.error('加载就诊记录失败:', e)
  } finally {
    loading.value = false
  }
}

function goToPatients() {
  router.push('/patients')
}

function goToAdmin() {
  router.push('/admin')
}

function goToVisitDetail(visitId: string) {
  router.push(`/visit/${visitId}`)
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

function getStatusText(status: string) {
  const statusMap: Record<string, string> = {
    draft: '草稿',
    editing: '编辑中',
    completed: '已完成'
  }
  return statusMap[status] || status
}

function getStatusClass(status: string) {
  const classMap: Record<string, string> = {
    draft: 'status-draft',
    editing: 'status-editing',
    completed: 'status-completed'
  }
  return classMap[status] || ''
}
</script>

<template>
  <div class="home-page">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <div class="logo">
          <span class="logo-icon">🏥</span>
          <h1>病历管理系统</h1>
        </div>
        <div class="user-info">
          <button class="theme-btn" @click="themeStore.toggleTheme()" title="切换主题">
            {{ themeStore.themeMode === 'light' ? '☀️' : themeStore.themeMode === 'dark' ? '🌙' : '🔄' }}
          </button>
          <span class="username">{{ authStore.user?.name || '用户' }}</span>
          <button class="logout-btn" @click="handleLogout">退出</button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content">
      <!-- 今日统计卡片 -->
      <section class="stats-section">
        <h2 class="section-title">今日概览</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon total">📋</div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.totalVisits }}</span>
              <span class="stat-label">今日就诊</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon pending">🎙️</div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.pendingTranscription }}</span>
              <span class="stat-label">待转写</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon completed">✅</div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.completedRecords }}</span>
              <span class="stat-label">已完成病历</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 快捷入口 -->
      <section class="quick-actions">
        <h2 class="section-title">快捷入口</h2>
        <div class="actions-grid">
          <button class="action-card primary" @click="goToPatients">
            <span class="action-icon">👥</span>
            <span class="action-text">患者管理</span>
          </button>
          <button class="action-card" @click="goToAdmin">
            <span class="action-icon">⚙️</span>
            <span class="action-text">系统管理</span>
          </button>
        </div>
      </section>

      <!-- 最近就诊记录 -->
      <section class="recent-visits">
        <h2 class="section-title">最近就诊记录</h2>
        <div class="visits-list" v-if="!loading">
          <div
            v-for="visit in recentVisits"
            :key="visit.id"
            class="visit-item"
            @click="goToVisitDetail(visit.id)"
          >
            <div class="visit-info">
              <h3>{{ visit.patientName }}</h3>
              <p class="visit-meta">
                <span>就诊号: {{ visit.visitNo }}</span>
                <span>{{ visit.visitDate }}</span>
              </p>
            </div>
            <span class="visit-status" :class="getStatusClass(visit.status)">
              {{ getStatusText(visit.status) }}
            </span>
          </div>
          <div v-if="recentVisits.length === 0" class="empty-state">
            <p>暂无就诊记录</p>
          </div>
        </div>
        <div v-else class="loading">加载中...</div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--color-background);
}

/* Header */
.header {
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-border);
}

.header-content {
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 60px;
  padding: 0 40px;
}

@media (max-width: 768px) {
  .header-content {
    padding: 0 16px;
  }
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 28px;
}

.logo h1 {
  font-size: 20px;
  margin: 0;
  color: var(--color-text);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.username {
  color: var(--color-text); opacity: 0.7;
  font-size: 14px;
}

.logout-btn {
  padding: 6px 14px;
  background: var(--color-btn-bg);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-text); opacity: 0.7;
  cursor: pointer;
}

.theme-btn {
  padding: 6px 10px;
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.theme-btn:hover {
  background: var(--color-btn-bg);
}

.logout-btn:hover {
  background: var(--color-btn-bg); border-color: var(--color-border-hover);
}

/* Main Content */
.main-content {
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px 40px;
}

@media (max-width: 768px) {
  .main-content {
    padding: 16px 16px;
  }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 16px 0;
}

/* Stats Section */
.stats-section {
  margin-bottom: 24px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.stat-card {
  background: var(--color-card-bg);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-icon.total {
  background: #e3f2fd;
}

.stat-icon.pending {
  background: #fff3e0;
}

.stat-icon.completed {
  background: #e8f5e9;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text); opacity: 0.5;
  margin-top: 4px;
}

/* Quick Actions */
.quick-actions {
  margin-bottom: 24px;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.action-card {
  background: var(--color-card-bg);
  border: none;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  transition: transform 0.2s, box-shadow 0.2s;
}

.action-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.action-card.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.action-icon {
  font-size: 32px;
}

.action-text {
  font-size: 14px;
  font-weight: 500;
}

/* Recent Visits */
.recent-visits {
  background: var(--color-card-bg);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.visits-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.visit-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;
}

.visit-item:hover {
  background: #f0f1f2;
}

.visit-info h3 {
  margin: 0 0 6px 0;
  font-size: 15px;
  color: var(--color-text);
}

.visit-meta {
  margin: 0;
  font-size: 13px;
  color: var(--color-text); opacity: 0.5;
}

.visit-meta span {
  margin-right: 16px;
}

.visit-status {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-draft {
  background: var(--color-background);
  color: var(--color-text); opacity: 0.7;
}

.status-editing {
  background: #e3f2fd;
  color: #1976d2;
}

.status-completed {
  background: #e8f5e9;
  color: #388e3c;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text); opacity: 0.5;
}
</style>
