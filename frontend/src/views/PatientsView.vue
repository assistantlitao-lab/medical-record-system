<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

interface Patient {
  id: string
  name: string
  card_no: string
  phone: string
  created_at: string
  last_visit_date: string | null
}

const patients = ref<Patient[]>([])
const loading = ref(false)
const searchKeyword = ref('')
const showAddModal = ref(false)

// 新增患者表单
const newPatient = ref({
  name: '',
  card_no: '',
  phone: '',
  gender: '',
  birthday: '',
  id_card: '',
  address: '',
  allergy: ''
})

const filteredPatients = computed(() => {
  if (!searchKeyword.value) return patients.value
  const keyword = searchKeyword.value.toLowerCase()
  return patients.value.filter(p =>
    p.name.toLowerCase().includes(keyword) ||
    p.card_no?.toLowerCase().includes(keyword) ||
    p.phone?.includes(keyword)
  )
})

onMounted(() => {
  loadPatients()
})

async function loadPatients() {
  loading.value = true
  try {
    const response = await fetch('/api/v1/patients', {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (response.status === 401) {
      authStore.logout()
      router.push('/login')
      return
    }
    if (!response.ok) {
      throw new Error('加载患者列表失败')
    }
    const result = await response.json()
    patients.value = result.data.list.map((p: any) => ({
      id: p.id,
      name: p.name,
      card_no: p.card_no || '',
      phone: p.phone || '',
      created_at: p.created_at,
      last_visit_date: p.last_visit_date
    }))
  } catch (error) {
    console.error('加载患者失败:', error)
    alert('加载患者列表失败')
  } finally {
    loading.value = false
  }
}

function goToPatientDetail(patientId: string) {
  router.push(`/patient/${patientId}`)
}

async function handleAddPatient() {
  if (!newPatient.value.name) {
    alert('请输入患者姓名')
    return
  }
  try {
    const response = await fetch('/api/v1/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify(newPatient.value)
    })

    const responseText = await response.text()
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      result = {}
    }

    if (!response.ok) {
      throw new Error(result.message || `创建失败 (${response.status})`)
    }

    showAddModal.value = false
    newPatient.value = { name: '', card_no: '', phone: '', gender: '', birthday: '', id_card: '', address: '', allergy: '' }
    await loadPatients()
    alert('创建成功')
  } catch (error: any) {
    alert(error.message || '创建失败')
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}
</script>

<template>
  <div class="patients-page">
    <header class="page-header">
      <div class="header-left">
        <button class="back-btn" @click="router.back()">←</button>
        <h1>患者管理</h1>
      </div>
      <button class="add-btn" @click="showAddModal = true">+ 新增患者</button>
    </header>

    <div class="search-bar">
      <input
        v-model="searchKeyword"
        type="text"
        placeholder="搜索姓名、卡号、手机号"
        class="search-input"
      />
    </div>

    <div class="patients-list" v-if="!loading">
      <div
        v-for="patient in filteredPatients"
        :key="patient.id"
        class="patient-card"
        @click="goToPatientDetail(patient.id)"
      >
        <div class="patient-info">
          <h3>{{ patient.name }}</h3>
          <p class="patient-meta">
            <span v-if="patient.card_no">卡号: {{ patient.card_no }}</span>
            <span v-if="patient.phone">电话: {{ patient.phone }}</span>
          </p>
        </div>
        <div class="patient-stats">
          <span class="visit-count">最近就诊: {{ formatDate(patient.last_visit_date) }}</span>
          <span class="arrow">›</span>
        </div>
      </div>

      <div v-if="filteredPatients.length === 0" class="empty-state">
        <p>暂无患者数据</p>
      </div>
    </div>

    <div v-else class="loading">加载中...</div>

    <!-- 新增患者弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click="showAddModal = false">
      <div class="modal-content" @click.stop>
        <h2>新增患者</h2>
        <form @submit.prevent="handleAddPatient">
          <div class="form-group">
            <label>姓名 *</label>
            <input v-model="newPatient.name" type="text" placeholder="患者姓名" required />
          </div>
          <div class="form-group">
            <label>卡号</label>
            <input v-model="newPatient.card_no" type="text" placeholder="就诊卡号" />
          </div>
          <div class="form-group">
            <label>手机号</label>
            <input v-model="newPatient.phone" type="tel" placeholder="手机号" maxlength="11" />
          </div>
          <div class="form-group">
            <label>性别</label>
            <select v-model="newPatient.gender">
              <option value="">请选择</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>
          <div class="form-group">
            <label>出生日期</label>
            <input v-model="newPatient.birthday" type="date" />
          </div>
          <div class="form-group">
            <label>过敏史</label>
            <textarea v-model="newPatient.allergy" placeholder="过敏史（如有）" rows="2"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showAddModal = false">取消</button>
            <button type="submit" class="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.patients-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 40px;
  background: white;
  border-bottom: 1px solid #eee;
}

@media (max-width: 768px) {
  .page-header {
    padding: 16px;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #666;
  cursor: pointer;
}

.page-header h1 {
  font-size: 18px;
  margin: 0;
}

.add-btn {
  padding: 8px 16px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.search-bar {
  padding: 12px 40px;
  background: white;
}

@media (max-width: 768px) {
  .search-bar {
    padding: 12px 16px;
  }
}

.search-input {
  width: 100%;
  max-width: 600px;
  padding: 10px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
}

.patients-list {
  padding: 12px 40px;
  max-width: 1600px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .patients-list {
    padding: 12px;
  }
}

.patient-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-radius: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.patient-info h3 {
  margin: 0 0 6px 0;
  font-size: 16px;
}

.patient-meta {
  margin: 0;
  font-size: 13px;
  color: #888;
}

.patient-meta span {
  margin-right: 12px;
}

.patient-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.visit-count {
  font-size: 13px;
  color: #888;
}

.arrow {
  font-size: 20px;
  color: #ccc;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #888;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  background: white;
  border-radius: 16px 16px 0 0;
  padding: 20px;
  overflow-y: auto;
}

.modal-content h2 {
  margin: 0 0 20px 0;
  font-size: 18px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #333;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-actions button {
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
}

.btn-secondary {
  background: #f0f0f0;
  border: none;
  color: #666;
}

.btn-primary {
  background: #667eea;
  border: none;
  color: white;
}
</style>
