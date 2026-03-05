<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const patientId = route.params.id as string

interface Visit {
  id: string
  visit_date: string
  chief_complaint: string
  diagnosis: string
  status: 'draft' | 'editing' | 'completed'
}

interface Patient {
  id: string
  name: string
  card_no: string
  phone: string
  gender: string
  birthday: string
  allergy: string
}

const patient = ref<Patient | null>(null)
const visits = ref<Visit[]>([])
const loading = ref(false)
const showEditModal = ref(false)
const editForm = ref<Patient | null>(null)

onMounted(() => {
  loadPatientDetail()
})

async function loadPatientDetail() {
  loading.value = true
  try {
    const [patientRes, visitsRes] = await Promise.all([
      fetch(`/api/v1/patients/${patientId}`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      }),
      fetch(`/api/v1/visits/patient/${patientId}`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      })
    ])

    // 处理 401 未授权
    if (patientRes.status === 401 || visitsRes.status === 401) {
      authStore.logout()
      router.push('/login')
      return
    }

    if (!patientRes.ok) {
      const errText = await patientRes.text()
      console.error('患者详情错误:', patientRes.status, errText)
      throw new Error(`加载患者详情失败 (${patientRes.status})`)
    }

    const patientData = await patientRes.json()
    console.log('患者数据:', patientData)
    if (patientData.code === 200) {
      const p = patientData.data
      // 转换gender数字为字符串
      const genderMap: Record<number, string> = { 0: 'female', 1: 'male', 2: 'other' }
      patient.value = {
        ...p,
        gender: genderMap[p.gender] || ''
      }
    }

    if (visitsRes.ok) {
      const visitsData = await visitsRes.json()
      console.log('就诊记录:', visitsData)
      if (visitsData.code === 200) {
        const visitsList = visitsData.data.list || []
        // 解析content字段提取主诉和诊断
        visits.value = visitsList.map((v: any) => {
          let chief_complaint = ''
          let diagnosis = ''
          if (v.content) {
            try {
              const content = typeof v.content === 'string' ? JSON.parse(v.content) : v.content
              if (content.fields) {
                const chiefField = content.fields.find((f: any) => f.field_key === 'chief_complaint' || f.name === 'chief_complaint' || f.label === '主诉')
                const diagnosisField = content.fields.find((f: any) => f.field_key === 'diagnosis' || f.name === 'diagnosis' || f.label === '诊断')
                chief_complaint = chiefField?.content || ''
                diagnosis = diagnosisField?.content || ''
              }
            } catch (e) {
              // ignore parse error
            }
          }
          return {
            id: v.id,
            visit_date: v.visit_date,
            chief_complaint: chief_complaint || '无记录',
            diagnosis: diagnosis,
            status: v.status === 0 ? 'draft' : v.status === 1 ? 'editing' : 'completed'
          }
        })
      }
    }
  } catch (error) {
    console.error('加载患者详情失败:', error)
    alert('加载患者详情失败')
  } finally {
    loading.value = false
  }
}

async function createNewVisit() {
  try {
    const res = await fetch(`/api/v1/visits/patient/${patientId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    const resText = await res.text()
    let data
    try {
      data = resText ? JSON.parse(resText) : {}
    } catch (e) {
      data = {}
    }

    if (!res.ok) {
      throw new Error(data.message || '创建就诊记录失败')
    }

    // 跳转到就诊详情页
    router.push(`/visit/${data.data.id}`)
  } catch (error: any) {
    alert(error.message || '创建失败')
  }
}

function goToVisit(visitId: string) {
  router.push(`/visit/${visitId}`)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function getStatusText(status: string) {
  const map: Record<string, string> = {
    'draft': '草稿',
    'editing': '编辑中',
    'completed': '已完成'
  }
  return map[status] || status
}

function getStatusClass(status: string) {
  const map: Record<string, string> = {
    'draft': 'status-draft',
    'editing': 'status-editing',
    'completed': 'status-completed'
  }
  return map[status] || ''
}

function openEditModal() {
  if (patient.value) {
    editForm.value = { ...patient.value }
    showEditModal.value = true
  }
}

async function savePatientEdit() {
  if (!editForm.value) return

  try {
    // 转换gender回数字
    const genderMap: Record<string, number> = { female: 0, male: 1, other: 2 }
    const genderNum = genderMap[editForm.value.gender] ?? null

    const res = await fetch(`/api/v1/patients/${patientId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: editForm.value.name,
        phone: editForm.value.phone,
        allergy: editForm.value.allergy,
        gender: genderNum
      })
    })

    const resText = await res.text()
    let data
    try {
      data = resText ? JSON.parse(resText) : {}
    } catch (e) {
      data = {}
    }

    if (!res.ok) {
      throw new Error(data.message || '更新失败')
    }

    // 更新本地数据
    patient.value = { ...editForm.value }
    showEditModal.value = false
    alert('保存成功')
  } catch (error: any) {
    alert(error.message || '保存失败')
  }
}
</script>

<template>
  <div class="patient-detail-page" v-if="patient">
    <header class="page-header">
      <div class="header-left">
        <button class="back-btn" @click="router.back()">←</button>
        <h1>{{ patient.name }}</h1>
      </div>
      <button class="edit-btn" @click="openEditModal">编辑</button>
    </header>

    <!-- 患者信息卡片 -->
    <div class="patient-card">
      <div class="info-row">
        <span class="label">卡号</span>
        <span class="value">{{ patient.card_no || '-' }}</span>
      </div>
      <div class="info-row">
        <span class="label">手机号</span>
        <span class="value">{{ patient.phone || '-' }}</span>
      </div>
      <div class="info-row">
        <span class="label">性别</span>
        <span class="value">{{ patient.gender === 'male' ? '男' : patient.gender === 'female' ? '女' : '-' }}</span>
      </div>
      <div class="info-row">
        <span class="label">出生日期</span>
        <span class="value">{{ patient.birthday || '-' }}</span>
      </div>
      <div class="info-row" v-if="patient.allergy">
        <span class="label">过敏史</span>
        <span class="value allergy">{{ patient.allergy }}</span>
      </div>
    </div>

    <!-- 就诊记录 -->
    <div class="visits-section">
      <div class="section-header">
        <h2>就诊记录</h2>
        <span class="count">{{ visits.length }}次</span>
      </div>

      <button class="new-visit-btn" @click="createNewVisit">
        <span class="icon">+</span>
        <span>新建就诊</span>
      </button>

      <div class="visits-timeline">
        <div
          v-for="visit in visits"
          :key="visit.id"
          class="visit-item"
          @click="goToVisit(visit.id)"
        >
          <div class="timeline-dot"></div>
          <div class="visit-card">
            <div class="visit-header">
              <span class="visit-date">{{ formatDate(visit.visit_date) }}</span>
              <span :class="['status-badge', getStatusClass(visit.status)]">
                {{ getStatusText(visit.status) }}
              </span>
            </div>
            <div class="visit-content">
              <p class="complaint">主诉: {{ visit.chief_complaint }}</p>
              <p class="diagnosis" v-if="visit.diagnosis">诊断: {{ visit.diagnosis }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="visits.length === 0" class="empty-state">
        <p>暂无就诊记录</p>
        <p class="hint">点击上方按钮创建首次就诊</p>
      </div>
    </div>

    <!-- 编辑患者弹窗 -->
    <div v-if="showEditModal && editForm" class="modal-overlay" @click="showEditModal = false">
      <div class="modal-content" @click.stop>
        <h2>编辑患者信息</h2>
        <form @submit.prevent="savePatientEdit">
          <div class="form-group">
            <label>姓名</label>
            <input v-model="editForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>性别</label>
            <select v-model="editForm.gender">
              <option value="">请选择</option>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="form-group">
            <label>手机号</label>
            <input v-model="editForm.phone" type="tel" maxlength="11" />
          </div>
          <div class="form-group">
            <label>过敏史</label>
            <textarea v-model="editForm.allergy" rows="2" placeholder="过敏史（如有）"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showEditModal = false">取消</button>
            <button type="submit" class="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <div v-else-if="loading" class="loading">加载中...</div>

  <div v-else class="error-state">
    <p>加载失败，请返回重试</p>
    <button class="back-btn" @click="router.back()">← 返回</button>
  </div>
</template>

<style scoped>
.patient-detail-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 20px;
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

.edit-btn {
  padding: 6px 14px;
  background: #f0f0f0;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
}

.patient-card {
  margin: 12px auto;
  padding: 16px 40px;
  background: white;
  border-radius: 12px;
  max-width: 1520px;
}

@media (max-width: 1600px) {
  .patient-card {
    margin: 12px 40px;
  }
}

@media (max-width: 768px) {
  .patient-card {
    margin: 12px 16px;
    padding: 16px;
  }
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.info-row:last-child {
  border-bottom: none;
}

.label {
  color: #888;
  font-size: 14px;
}

.value {
  color: #333;
  font-size: 14px;
}

.value.allergy {
  color: #e74c3c;
}

.visits-section {
  margin: 20px auto 0;
  padding: 0 40px;
  max-width: 1520px;
}

@media (max-width: 1600px) {
  .visits-section {
    margin: 20px 40px 0;
  }
}

@media (max-width: 768px) {
  .visits-section {
    margin: 20px 16px 0;
    padding: 0;
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;
  margin-bottom: 12px;
}

.section-header h2 {
  font-size: 16px;
  margin: 0;
}

.count {
  font-size: 13px;
  color: #888;
}

.new-visit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 0 16px;
  padding: 14px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  cursor: pointer;
  max-width: 400px;
}

.new-visit-btn .icon {
  font-size: 20px;
}

.visits-timeline {
  padding: 0;
}

.visit-item {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  cursor: pointer;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  background: #667eea;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.visit-card {
  flex: 1;
  padding: 14px;
  background: white;
  border-radius: 10px;
}

.visit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.visit-date {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.status-badge {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.status-draft {
  background: #f0f0f0;
  color: #888;
}

.status-editing {
  background: #fff3cd;
  color: #856404;
}

.status-completed {
  background: #d4edda;
  color: #155724;
}

.visit-content {
  font-size: 13px;
}

.visit-content p {
  margin: 4px 0;
  color: #666;
}

.complaint {
  color: #333 !important;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}

.empty-state .hint {
  font-size: 13px;
  margin-top: 8px;
}

.loading {
  text-align: center;
  padding: 60px;
  color: #888;
}

.error-state {
  text-align: center;
  padding: 60px 20px;
  color: #888;
}

.error-state p {
  margin-bottom: 20px;
}

.error-state .back-btn {
  padding: 10px 20px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
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
