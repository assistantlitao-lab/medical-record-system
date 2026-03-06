<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const themeStore = useThemeStore()
const authStore = useAuthStore()
const activeTab = ref('overview')

// 模板列表
const templates = ref<{ id: string; name: string; description: string; is_default: number; fieldCount: number }[]>([])
const showAddTemplateModal = ref(false)
const showEditTemplateModal = ref(false)
const showTemplateFieldsModal = ref(false)
const editingTemplate = ref<{ id: string; name: string; description: string; fields: any[] } | null>(null)
const newTemplate = ref({ name: '', description: '' })
const newField = ref({ name: '', field_key: '', type: 'textarea', required: false, placeholder: '', sort_order: 0 })

// 回收站
const recycleBinTab = ref('patients')
const deletedPatients = ref<any[]>([])
const deletedVisits = ref<any[]>([])

const fieldTypes = [
  { value: 'text', label: '文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'select', label: '下拉选择' }
]

// 统计数据
const stats = ref({
  totalUsers: 5,
  totalPatients: 128,
  totalVisits: 256,
  todayVisits: 12,
  asrSuccessRate: 98.5,
  avgGenerationTime: 15.2
})

// 用户列表
const users = ref<{ id: string; name: string; phone: string; recordCount: number; lastLoginAt: string }[]>([])

// 加载用户列表
async function loadUsers() {
  try {
    const response = await fetch('/api/v1/admin/users', {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (!response.ok) {
      throw new Error('加载用户列表失败')
    }
    const result = await response.json()
    users.value = result.data.list.map((u: any) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      recordCount: u.record_count || 0,
      lastLoginAt: u.last_login_at || '-'
    }))
  } catch (error) {
    console.error('加载用户失败:', error)
  }
}

onMounted(() => {
  loadUsers()
  loadTemplates()
  loadDictionary()
})

// 加载模板列表
async function loadTemplates() {
  try {
    const response = await fetch('/api/v1/templates', {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (!response.ok) {
      throw new Error('加载模板列表失败')
    }
    const result = await response.json()
    templates.value = result.data.map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      is_default: t.is_default,
      fieldCount: t.fields?.length || 0
    }))
  } catch (error) {
    console.error('加载模板失败:', error)
  }
}

async function addTemplate() {
  if (!newTemplate.value.name) {
    alert('请输入模板名称')
    return
  }

  try {
    const response = await fetch('/api/v1/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify(newTemplate.value)
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

    await loadTemplates()
    showAddTemplateModal.value = false
    newTemplate.value = { name: '', description: '' }
    alert('创建成功')
  } catch (error: any) {
    alert(error.message || '创建失败')
  }
}

async function saveEditTemplate() {
  if (!editingTemplate.value) return

  try {
    const response = await fetch(`/api/v1/templates/${editingTemplate.value.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify({
        name: editingTemplate.value.name,
        description: editingTemplate.value.description
      })
    })

    const responseText = await response.text()
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      result = {}
    }

    if (!response.ok) {
      throw new Error(result.message || `更新失败 (${response.status})`)
    }

    await loadTemplates()
    showEditTemplateModal.value = false
    editingTemplate.value = null
    alert('保存成功')
  } catch (error: any) {
    alert(error.message || '保存失败')
  }
}

async function deleteTemplate(templateId: string) {
  if (!confirm('确定删除该模板吗？')) return

  try {
    const response = await fetch(`/api/v1/templates/${templateId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    const responseText = await response.text()
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      result = {}
    }

    if (!response.ok) {
      throw new Error(result.message || `删除失败 (${response.status})`)
    }

    await loadTemplates()
    alert('删除成功')
  } catch (error: any) {
    alert(error.message || '删除失败')
  }
}

async function openEditTemplateModal(template: any) {
  try {
    const response = await fetch(`/api/v1/templates/${template.id}`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (!response.ok) {
      throw new Error('加载模板详情失败')
    }
    const result = await response.json()
    editingTemplate.value = {
      id: result.data.id,
      name: result.data.name,
      description: result.data.description,
      fields: result.data.fields || []
    }
    showEditTemplateModal.value = true
  } catch (error) {
    console.error('加载模板详情失败:', error)
  }
}

function openTemplateFieldsModal(template: any) {
  openEditTemplateModal(template).then(() => {
    showTemplateFieldsModal.value = true
  })
}

async function addField() {
  if (!editingTemplate.value || !newField.value.name || !newField.value.field_key) {
    alert('请输入字段名称和键名')
    return
  }

  try {
    const response = await fetch(`/api/v1/templates/${editingTemplate.value.id}/fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify(newField.value)
    })

    const responseText = await response.text()
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      result = {}
    }

    if (!response.ok) {
      throw new Error(result.message || `添加失败 (${response.status})`)
    }

    // Reload template to get updated fields
    await openEditTemplateModal(editingTemplate.value)
    newField.value = { name: '', field_key: '', type: 'textarea', required: false, placeholder: '', sort_order: 0 }
    alert('添加成功')
  } catch (error: any) {
    alert(error.message || '添加失败')
  }
}

async function deleteField(fieldId: string) {
  if (!editingTemplate.value) return
  if (!confirm('确定删除该字段吗？')) return

  try {
    const response = await fetch(`/api/v1/templates/${editingTemplate.value.id}/fields/${fieldId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    const responseText = await response.text()
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      result = {}
    }

    if (!response.ok) {
      throw new Error(result.message || `删除失败 (${response.status})`)
    }

    await openEditTemplateModal(editingTemplate.value)
    alert('删除成功')
  } catch (error: any) {
    alert(error.message || '删除失败')
  }
}

// 加载词典规则
// 加载回收站数据
async function loadRecycleBin() {
  try {
    if (recycleBinTab.value === 'patients') {
      const response = await fetch('/api/v1/admin/recycle-bin/patients', {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      })
      if (response.ok) {
        const result = await response.json()
        deletedPatients.value = result.data.list
      }
    } else {
      const response = await fetch('/api/v1/admin/recycle-bin/visits', {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      })
      if (response.ok) {
        const result = await response.json()
        deletedVisits.value = result.data.list
      }
    }
  } catch (error) {
    console.error('加载回收站数据失败:', error)
  }
}

async function restorePatient(patientId: string) {
  if (!confirm('确定恢复该患者吗？')) return

  try {
    const response = await fetch(`/api/v1/admin/recycle-bin/patients/${patientId}/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    if (response.ok) {
      await loadRecycleBin()
      alert('恢复成功')
    } else {
      throw new Error('恢复失败')
    }
  } catch (error) {
    alert('恢复失败')
  }
}

async function restoreVisit(visitId: string) {
  if (!confirm('确定恢复该就诊记录吗？')) return

  try {
    const response = await fetch(`/api/v1/admin/recycle-bin/visits/${visitId}/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    if (response.ok) {
      await loadRecycleBin()
      alert('恢复成功')
    } else {
      throw new Error('恢复失败')
    }
  } catch (error) {
    alert('恢复失败')
  }
}

async function permanentDeletePatient(patientId: string) {
  if (!confirm('⚠️ 警告：永久删除将不可恢复！确定继续吗？')) return

  try {
    const response = await fetch(`/api/v1/admin/recycle-bin/patients/${patientId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    if (response.ok) {
      await loadRecycleBin()
      alert('已永久删除')
    } else {
      throw new Error('删除失败')
    }
  } catch (error) {
    alert('删除失败')
  }
}

async function permanentDeleteVisit(visitId: string) {
  if (!confirm('⚠️ 警告：永久删除将不可恢复！确定继续吗？')) return

  try {
    const response = await fetch(`/api/v1/admin/recycle-bin/visits/${visitId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    if (response.ok) {
      await loadRecycleBin()
      alert('已永久删除')
    } else {
      throw new Error('删除失败')
    }
  } catch (error) {
    alert('删除失败')
  }
}

async function cleanupRecycleBin() {
  if (!confirm('将清理30天前的所有项目，确定继续吗？')) return

  try {
    const response = await fetch('/api/v1/admin/recycle-bin/cleanup', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    if (response.ok) {
      const result = await response.json()
      await loadRecycleBin()
      alert(`清理完成：删除${result.data.deleted_patients}个患者，${result.data.deleted_visits}条就诊记录`)
    } else {
      throw new Error('清理失败')
    }
  } catch (error) {
    alert('清理失败')
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

// 监听回收站标签切换
watch(recycleBinTab, () => {
  loadRecycleBin()
})

// 监听主标签切换
watch(activeTab, (newTab) => {
  if (newTab === 'recycle-bin') {
    loadRecycleBin()
  }
})

async function loadDictionary() {
  try {
    const response = await fetch('/api/v1/dictionary', {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (!response.ok) {
      throw new Error('加载词典规则失败')
    }
    const result = await response.json()
    dictionaryRules.value = result.data
  } catch (error) {
    console.error('加载词典规则失败:', error)
  }
}

async function addDictRule() {
  if (!newDictRule.value.error || !newDictRule.value.correct) {
    alert('请填写错误词和正确词')
    return
  }

  try {
    const response = await fetch('/api/v1/dictionary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify({
        error: newDictRule.value.error,
        correct: newDictRule.value.correct,
        category: newDictRule.value.category,
        auto_apply: newDictRule.value.autoApply
      })
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

    await loadDictionary()
    showAddDictModal.value = false
    newDictRule.value = { error: '', correct: '', category: 'drugs', autoApply: true }
    alert('创建成功')
  } catch (error: any) {
    alert(error.message || '创建失败')
  }
}

async function deleteDictRule(ruleId: string) {
  if (!confirm('确定删除该规则吗？')) return

  try {
    const response = await fetch(`/api/v1/dictionary/${ruleId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    const responseText = await response.text()
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      result = {}
    }

    if (!response.ok) {
      throw new Error(result.message || `删除失败 (${response.status})`)
    }

    await loadDictionary()
    alert('删除成功')
  } catch (error: any) {
    alert(error.message || '删除失败')
  }
}

// 词典规则
const dictionaryRules = ref<{ id: string; error: string; correct: string; category: string; auto_apply: number }[]>([])

const showAddUserModal = ref(false)
const showEditUserModal = ref(false)
const showAddDictModal = ref(false)

const newUser = ref({ name: '', phone: '', password: '' })
const editingUser = ref<{ id: string; name: string; phone: string; password: string } | null>(null)
const newDictRule = ref({ error: '', correct: '', category: 'drugs', autoApply: true })

const categories = [
  { value: 'drugs', label: '药品' },
  { value: 'diseases', label: '疾病' },
  { value: 'anatomy', label: '解剖' },
  { value: 'exams', label: '检查' },
  { value: 'symptoms', label: '症状' }
]

function getCategoryLabel(category: string) {
  return categories.find(c => c.value === category)?.label || category
}

async function addUser() {
  // 表单验证
  if (!newUser.value.name || !newUser.value.phone || !newUser.value.password) {
    alert('请填写完整的员工信息')
    return
  }

  try {
    const response = await fetch('/api/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify({
        name: newUser.value.name,
        phone: newUser.value.phone,
        password: newUser.value.password
      })
    })

    // 先获取响应文本
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

    await loadUsers()
    showAddUserModal.value = false
    newUser.value = { name: '', phone: '', password: '' }
    alert('创建成功')
  } catch (error: any) {
    alert(error.message || '创建失败')
  }
}

function openEditModal(user: { id: string; name: string; phone: string; recordCount: number; lastLoginAt: string }) {
  editingUser.value = {
    id: user.id,
    name: user.name,
    phone: user.phone,
    password: ''
  }
  showEditUserModal.value = true
}

async function saveEditUser() {
  if (!editingUser.value) return

  // 表单验证
  if (!editingUser.value.name || !editingUser.value.phone) {
    alert('姓名和手机号不能为空')
    return
  }

  try {
    const body: any = {
      name: editingUser.value.name,
      phone: editingUser.value.phone
    }
    if (editingUser.value.password) {
      body.password = editingUser.value.password
    }

    const response = await fetch(`/api/v1/admin/users/${editingUser.value.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`
      },
      body: JSON.stringify(body)
    })

    const responseText = await response.text()
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      result = {}
    }

    if (!response.ok) {
      throw new Error(result.message || `更新失败 (${response.status})`)
    }

    await loadUsers()
    showEditUserModal.value = false
    editingUser.value = null
    alert('保存成功')
  } catch (error: any) {
    alert(error.message || '保存失败')
  }
}

async function deleteUser(userId: string) {
  if (!confirm('确定删除该用户吗？')) return

  try {
    const response = await fetch(`/api/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })

    const responseText = await response.text()
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      result = {}
    }

    if (!response.ok) {
      throw new Error(result.message || `删除失败 (${response.status})`)
    }

    await loadUsers()
    alert('删除成功')
  } catch (error: any) {
    alert(error.message || '删除失败')
  }
}
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div class="header-left">
        <button class="back-btn" @click="router.back()">←</button>
        <h1>管理后台</h1>
      </div>
    <button class="theme-btn" @click="themeStore.toggleTheme()" title="切换主题">
        {{ themeStore.themeMode === 'light' ? '☀️' : themeStore.themeMode === 'dark' ? '🌙' : '🔄' }}
      </button>
    </header>

    <div class="admin-tabs">
      <button
        :class="['tab-btn', { active: activeTab === 'overview' }]"
        @click="activeTab = 'overview'"
      >
        概览
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'users' }]"
        @click="activeTab = 'users'"
      >
        员工账号
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'dictionary' }]"
        @click="activeTab = 'dictionary'"
      >
        智能词典
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'logs' }]"
        @click="activeTab = 'logs'"
      >
        操作日志
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'templates' }]"
        @click="activeTab = 'templates'"
      >
        病历模板
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'recycle-bin' }]"
        @click="activeTab = 'recycle-bin'"
      >
        回收站
      </button>
    </div>

    <div class="admin-content">
      <!-- 概览 -->
      <div v-if="activeTab === 'overview'" class="overview-tab">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ stats.totalUsers }}</div>
            <div class="stat-label">员工数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats.totalPatients }}</div>
            <div class="stat-label">患者数</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats.totalVisits }}</div>
            <div class="stat-label">就诊记录</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats.todayVisits }}</div>
            <div class="stat-label">今日就诊</div>
          </div>
        </div>

        <div class="metric-cards">
          <div class="metric-card">
            <h3>ASR转写成功率</h3>
            <div class="metric-value success">{{ stats.asrSuccessRate }}%</div>
            <p class="metric-desc">过去7天平均</p>
          </div>
          <div class="metric-card">
            <h3>平均生成耗时</h3>
            <div class="metric-value">{{ stats.avgGenerationTime }}s</div>
            <p class="metric-desc">病历生成平均耗时</p>
          </div>
        </div>

        <div class="quick-actions">
          <h3>快捷操作</h3>
          <div class="action-buttons">
            <button @click="activeTab = 'users'">管理员工</button>
            <button @click="activeTab = 'dictionary'">配置词典</button>
            <button @click="router.push('/templates')">病历模板</button>
          </div>
        </div>
      </div>

      <!-- 员工账号 -->
      <div v-else-if="activeTab === 'users'" class="users-tab">
        <div class="section-header">
          <h2>员工账号管理</h2>
          <button class="add-btn" @click="showAddUserModal = true">+ 新增员工</button>
        </div>

        <div class="users-list">
          <div v-for="user in users" :key="user.id" class="user-card">
            <div class="user-info">
              <h3>{{ user.name }}</h3>
              <p class="user-phone">{{ user.phone }}</p>
              <p class="user-meta">病历数: {{ user.recordCount }} | 最后登录: {{ user.lastLoginAt }}</p>
            </div>
            <div class="user-actions">
              <button class="edit-btn" @click="openEditModal(user)">编辑</button>
              <button class="delete-btn" @click="deleteUser(user.id)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 智能词典 -->
      <div v-else-if="activeTab === 'dictionary'" class="dictionary-tab">
        <div class="section-header">
          <h2>智能纠错词典</h2>
          <button class="add-btn" @click="showAddDictModal = true">+ 添加规则</button>
        </div>

        <div class="dict-rules-list">
          <div v-for="rule in dictionaryRules" :key="rule.id" class="dict-rule-card">
            <div class="rule-content">
              <span class="error-text">{{ rule.error }}</span>
              <span class="arrow">→</span>
              <span class="correct-text">{{ rule.correct }}</span>
              <span class="category-badge">{{ getCategoryLabel(rule.category) }}</span>
              <span v-if="rule.auto_apply" class="auto-badge">自动</span>
            </div>
            <button class="delete-btn" @click="deleteDictRule(rule.id)">删除</button>
          </div>
        </div>
      </div>

      <!-- 操作日志 -->
      <div v-else-if="activeTab === 'logs'" class="logs-tab">
        <div class="section-header">
          <h2>操作日志</h2>
        </div>
        <div class="logs-list">
          <div class="log-item">
            <div class="log-time">2024-03-04 10:30</div>
            <div class="log-content">
              <span class="log-user">张医生</span>
              <span class="log-action">创建了患者</span>
              <span class="log-target">张三</span>
            </div>
          </div>
          <div class="log-item">
            <div class="log-time">2024-03-04 10:25</div>
            <div class="log-content">
              <span class="log-user">李医生</span>
              <span class="log-action">生成了病历</span>
              <span class="log-target">就诊记录 #2024030402</span>
            </div>
          </div>
          <div class="log-item">
            <div class="log-time">2024-03-04 09:15</div>
            <div class="log-content">
              <span class="log-user">王医生</span>
              <span class="log-action">登录系统</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 病历模板 -->
      <div v-else-if="activeTab === 'templates'" class="templates-tab">
        <div class="section-header">
          <h2>病历模板管理</h2>
          <button class="add-btn" @click="showAddTemplateModal = true">+ 新增模板</button>
        </div>

        <div class="templates-list">
          <div v-for="template in templates" :key="template.id" class="template-card">
            <div class="template-info">
              <h3>
                {{ template.name }}
                <span v-if="template.is_default" class="default-badge">默认</span>
              </h3>
              <p class="template-desc">{{ template.description || '暂无描述' }}</p>
              <p class="template-meta">字段数: {{ template.fieldCount }}</p>
            </div>
            <div class="template-actions">
              <button class="edit-btn" @click="openEditTemplateModal(template)">编辑</button>
              <button class="fields-btn" @click="openTemplateFieldsModal(template)">字段</button>
              <button class="delete-btn" @click="deleteTemplate(template.id)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 回收站 -->
      <div v-else-if="activeTab === 'recycle-bin'" class="recycle-bin-tab">
        <div class="section-header">
          <h2>回收站</h2>
          <button class="cleanup-btn" @click="cleanupRecycleBin">清理30天前项目</button>
        </div>

        <div class="recycle-bin-tabs">
          <button
            :class="['sub-tab-btn', { active: recycleBinTab === 'patients' }]"
            @click="recycleBinTab = 'patients'"
          >
            已删除患者
          </button>
          <button
            :class="['sub-tab-btn', { active: recycleBinTab === 'visits' }]"
            @click="recycleBinTab = 'visits'"
          >
            已删除就诊记录
          </button>
        </div>

        <!-- 已删除患者 -->
        <div v-if="recycleBinTab === 'patients'" class="deleted-list">
          <div v-for="patient in deletedPatients" :key="patient.id" class="deleted-card">
            <div class="deleted-info">
              <h3>{{ patient.name }}</h3>
              <p class="deleted-meta">
                卡号: {{ patient.card_no || '-' }} | 电话: {{ patient.phone || '-' }}
              </p>
              <p class="deleted-meta">
                创建人: {{ patient.creator_name || '-' }} | 就诊记录: {{ patient.visit_count }}条
              </p>
              <p class="deleted-time">
                删除时间: {{ formatDate(patient.deleted_at) }}
              </p>
            </div>
            <div class="deleted-actions">
              <button class="restore-btn" @click="restorePatient(patient.id)">恢复</button>
              <button class="permanent-delete-btn" @click="permanentDeletePatient(patient.id)">彻底删除</button>
            </div>
          </div>
          <div v-if="deletedPatients.length === 0" class="empty-state">
            暂无已删除的患者
          </div>
        </div>

        <!-- 已删除就诊记录 -->
        <div v-else class="deleted-list">
          <div v-for="visit in deletedVisits" :key="visit.id" class="deleted-card">
            <div class="deleted-info">
              <h3>就诊 #{{ visit.visit_no }}</h3>
              <p class="deleted-meta">
                患者: {{ visit.patient_name || '-' }} | 创建人: {{ visit.creator_name || '-' }}
              </p>
              <p class="deleted-meta">
                就诊日期: {{ visit.visit_date }}
              </p>
              <p class="deleted-time">
                删除时间: {{ formatDate(visit.deleted_at) }}
              </p>
            </div>
            <div class="deleted-actions">
              <button class="restore-btn" @click="restoreVisit(visit.id)">恢复</button>
              <button class="permanent-delete-btn" @click="permanentDeleteVisit(visit.id)">彻底删除</button>
            </div>
          </div>
          <div v-if="deletedVisits.length === 0" class="empty-state">
            暂无已删除的就诊记录
          </div>
        </div>
      </div>
    </div>

    <!-- 添加用户弹窗 -->
    <div v-if="showAddUserModal" class="modal-overlay" @click="showAddUserModal = false">
      <div class="modal-content" @click.stop>
        <h2>新增员工</h2>
        <form @submit.prevent="addUser">
          <div class="form-group">
            <label>姓名</label>
            <input v-model="newUser.name" type="text" placeholder="员工姓名" required />
          </div>
          <div class="form-group">
            <label>手机号</label>
            <input v-model="newUser.phone" type="tel" placeholder="手机号" maxlength="11" required />
          </div>
          <div class="form-group">
            <label>初始密码</label>
            <input v-model="newUser.password" type="password" placeholder="初始密码" required />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showAddUserModal = false">取消</button>
            <button type="submit" class="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 编辑用户弹窗 -->
    <div v-if="showEditUserModal && editingUser" class="modal-overlay" @click="showEditUserModal = false">
      <div class="modal-content" @click.stop>
        <h2>编辑员工</h2>
        <form @submit.prevent="saveEditUser">
          <div class="form-group">
            <label>姓名</label>
            <input v-model="editingUser.name" type="text" placeholder="员工姓名" required />
          </div>
          <div class="form-group">
            <label>手机号</label>
            <input v-model="editingUser.phone" type="tel" placeholder="手机号" maxlength="11" required />
          </div>
          <div class="form-group">
            <label>新密码（留空表示不修改）</label>
            <input v-model="editingUser.password" type="password" placeholder="不修改请留空" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showEditUserModal = false">取消</button>
            <button type="submit" class="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 添加词典规则弹窗 -->
    <div v-if="showAddDictModal" class="modal-overlay" @click="showAddDictModal = false">
      <div class="modal-content" @click.stop>
        <h2>添加纠错规则</h2>
        <form @submit.prevent="addDictRule">
          <div class="form-group">
            <label>错误词</label>
            <input v-model="newDictRule.error" type="text" placeholder="ASR识别错误的词" required />
          </div>
          <div class="form-group">
            <label>正确词</label>
            <input v-model="newDictRule.correct" type="text" placeholder="正确的医学术语" required />
          </div>
          <div class="form-group">
            <label>分类</label>
            <select v-model="newDictRule.category">
              <option v-for="cat in categories" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>
              <input v-model="newDictRule.autoApply" type="checkbox" />
              自动应用
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showAddDictModal = false">取消</button>
            <button type="submit" class="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 添加模板弹窗 -->
    <div v-if="showAddTemplateModal" class="modal-overlay" @click="showAddTemplateModal = false">
      <div class="modal-content" @click.stop>
        <h2>新增病历模板</h2>
        <form @submit.prevent="addTemplate">
          <div class="form-group">
            <label>模板名称</label>
            <input v-model="newTemplate.name" type="text" placeholder="如：标准病历模板" required />
          </div>
          <div class="form-group">
            <label>描述</label>
            <input v-model="newTemplate.description" type="text" placeholder="模板描述（选填）" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showAddTemplateModal = false">取消</button>
            <button type="submit" class="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 编辑模板弹窗 -->
    <div v-if="showEditTemplateModal && editingTemplate" class="modal-overlay" @click="showEditTemplateModal = false">
      <div class="modal-content" @click.stop>
        <h2>编辑病历模板</h2>
        <form @submit.prevent="saveEditTemplate">
          <div class="form-group">
            <label>模板名称</label>
            <input v-model="editingTemplate.name" type="text" required />
          </div>
          <div class="form-group">
            <label>描述</label>
            <input v-model="editingTemplate.description" type="text" />
          </div>

          <!-- 字段管理 -->
          <div class="field-management">
            <h3>模板字段</h3>
            <div class="fields-list">
              <div v-for="field in editingTemplate.fields" :key="field.id" class="field-item">
                <span class="field-name">{{ field.name }}</span>
                <span class="field-key">{{ field.field_key }}</span>
                <span :class="['field-type', field.type]">{{ field.type }}</span>
                <span v-if="field.required" class="required-badge">必填</span>
                <button type="button" class="delete-field-btn" @click="deleteField(field.id)">删除</button>
              </div>
            </div>

            <div class="add-field-section">
              <h4>添加新字段</h4>
              <div class="form-row">
                <input v-model="newField.name" type="text" placeholder="字段名称（如：主诉）" />
                <input v-model="newField.field_key" type="text" placeholder="字段键（如：chief_complaint）" />
              </div>
              <div class="form-row">
                <select v-model="newField.type">
                  <option v-for="t in fieldTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
                <input v-model="newField.placeholder" type="text" placeholder="提示文字" />
              </div>
              <div class="form-row">
                <label class="checkbox-label">
                  <input v-model="newField.required" type="checkbox" />
                  必填
                </label>
                <input v-model.number="newField.sort_order" type="number" placeholder="排序" />
              </div>
              <button type="button" class="add-field-btn" @click="addField">添加字段</button>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showEditTemplateModal = false">取消</button>
            <button type="submit" class="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: var(--color-background);
}

.page-header {
  display: flex;
  align-items: center;
  padding: 16px 40px;
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-border);
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
  color: var(--color-text);
  cursor: pointer;
}

.page-header h1 {
  font-size: 18px;
  margin: 0;
}

/* Tabs */
.admin-tabs {
  display: flex;
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  padding: 0 40px;
}

@media (max-width: 768px) {
  .admin-tabs {
    padding: 0;
  }
}

.tab-btn {
  flex: 1;
  max-width: 200px;
  padding: 14px 16px;
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
}

.tab-btn.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

/* Content */
.admin-content {
  padding: 16px 40px;
  max-width: 1600px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .admin-content {
    padding: 16px;
  }
}

/* Overview Tab */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: var(--color-card-bg);
  padding: 20px;
  border-radius: 12px;
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: 600;
  color: #667eea;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text); opacity: 0.6;
}

.metric-cards {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  background: var(--color-card-bg);
  padding: 16px;
  border-radius: 12px;
}

.metric-card h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: var(--color-text);
  font-weight: normal;
}

.metric-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.metric-value.success {
  color: #27ae60;
}

.metric-desc {
  margin: 0;
  font-size: 12px;
  color: #999;
}

.quick-actions {
  background: var(--color-card-bg);
  padding: 16px;
  border-radius: 12px;
}

.quick-actions h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.action-buttons button {
  padding: 10px 16px;
  background: #f0f0f0;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  cursor: pointer;
}

/* Users Tab */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h2 {
  margin: 0;
  font-size: 16px;
}

.add-btn {
  padding: 8px 14px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.users-list, .dict-rules-list, .logs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-card, .dict-rule-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-card-bg);
  padding: 16px;
  border-radius: 12px;
}

.user-info h3 {
  margin: 0 0 4px 0;
  font-size: 15px;
}

.user-phone, .user-meta {
  margin: 0;
  font-size: 13px;
  color: var(--color-text); opacity: 0.6;
}

.user-actions {
  display: flex;
  gap: 8px;
}

.edit-btn {
  padding: 6px 12px;
  background: #e3f2fd;
  color: #1976d2;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.edit-btn:hover {
  background: #bbdefb;
}

.delete-btn {
  padding: 6px 12px;
  background: #ffebee;
  color: #e74c3c;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

/* Dictionary Tab */
.rule-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.error-text {
  color: #e74c3c;
  text-decoration: line-through;
  font-size: 14px;
}

.arrow {
  color: #999;
}

.correct-text {
  color: #27ae60;
  font-weight: 500;
  font-size: 14px;
}

.category-badge {
  padding: 2px 8px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  font-size: 11px;
}

.auto-badge {
  padding: 2px 8px;
  background: #e8f5e9;
  color: #388e3c;
  border-radius: 4px;
  font-size: 11px;
}

/* Logs Tab */
.log-item {
  background: var(--color-card-bg);
  padding: 14px 16px;
  border-radius: 12px;
}

.log-time {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.log-content {
  font-size: 14px;
}

.log-user {
  font-weight: 500;
  color: var(--color-text);
}

.log-action {
  color: var(--color-text);
  margin: 0 4px;
}

.log-target {
  color: #667eea;
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
  background: var(--color-card-bg);
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
  color: var(--color-text);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-group input[type="checkbox"] {
  width: auto;
  margin-right: 8px;
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
  border: none;
}

.btn-secondary {
  background: #f0f0f0;
  color: var(--color-text);
}

.btn-primary {
  background: #667eea;
  color: white;
}

/* Templates Tab */
.templates-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-card-bg);
  padding: 16px;
  border-radius: 12px;
}

.template-info h3 {
  margin: 0 0 6px 0;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.default-badge {
  padding: 2px 8px;
  background: #e8f5e9;
  color: #388e3c;
  border-radius: 4px;
  font-size: 11px;
  font-weight: normal;
}

.template-desc {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: var(--color-text);
}

.template-meta {
  margin: 0;
  font-size: 12px;
  color: #999;
}

.template-actions {
  display: flex;
  gap: 8px;
}

.fields-btn {
  padding: 6px 12px;
  background: #e8f5e9;
  color: #388e3c;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.fields-btn:hover {
  background: #c8e6c9;
}

/* Field Management */
.field-management {
  margin: 20px 0;
  padding: 16px;
  background: var(--color-background-soft);
  border-radius: 8px;
}

.field-management h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--color-text);
}

.fields-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.field-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--color-card-bg);
  border-radius: 6px;
  font-size: 13px;
}

.field-name {
  font-weight: 500;
  color: var(--color-text);
  min-width: 80px;
}

.field-key {
  color: var(--color-text);
  font-family: monospace;
  font-size: 12px;
  flex: 1;
}

.field-type {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  text-transform: uppercase;
}

.field-type.text {
  background: #e3f2fd;
  color: #1976d2;
}

.field-type.textarea {
  background: #fff3e0;
  color: #f57c00;
}

.field-type.select {
  background: #f3e5f5;
  color: #7b1fa2;
}

.required-badge {
  padding: 2px 8px;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
  font-size: 11px;
}

.delete-field-btn {
  padding: 4px 10px;
  background: #ffebee;
  color: #e74c3c;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.add-field-section {
  padding-top: 16px;
  border-top: 1px dashed #ddd;
}

.add-field-section h4 {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--color-text);
}

.form-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.form-row input,
.form-row select {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.checkbox-label input {
  width: auto;
}

.add-field-btn {
  padding: 8px 16px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.add-field-btn:hover {
  background: #5a6fd6;
}

/* Recycle Bin */
.cleanup-btn {
  padding: 8px 14px;
  background: #ff9800;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.cleanup-btn:hover {
  background: #f57c00;
}

.recycle-bin-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.sub-tab-btn {
  padding: 10px 20px;
  background: #f0f0f0;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  color: var(--color-text);
}

.sub-tab-btn.active {
  background: #667eea;
  color: white;
}

.deleted-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deleted-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-card-bg);
  padding: 16px;
  border-radius: 12px;
  border-left: 4px solid #e74c3c;
}

.deleted-info h3 {
  margin: 0 0 6px 0;
  font-size: 15px;
  color: var(--color-text);
}

.deleted-meta {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: var(--color-text);
}

.deleted-time {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: #e74c3c;
}

.deleted-actions {
  display: flex;
  gap: 8px;
}

.restore-btn {
  padding: 8px 16px;
  background: #e8f5e9;
  color: #388e3c;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.restore-btn:hover {
  background: #c8e6c9;
}

.permanent-delete-btn {
  padding: 8px 16px;
  background: #ffebee;
  color: #c62828;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.permanent-delete-btn:hover {
  background: #ffcdd2;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
  font-size: 14px;
}
.theme-btn {
  padding: 8px 12px;
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
</style>
