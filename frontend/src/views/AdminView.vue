<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const activeTab = ref('overview')

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
})

// 词典规则
const dictionaryRules = ref([
  { id: '1', error: '阿莫吸林', correct: '阿莫西林', category: 'drugs', autoApply: true },
  { id: '2', error: '头苞', correct: '头孢', category: 'drugs', autoApply: true },
  { id: '3', error: '发绕', correct: '发热', category: 'symptoms', autoApply: true },
  { id: '4', error: '咳速', correct: '咳嗽', category: 'symptoms', autoApply: true }
])

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

async function addDictRule() {
  // TODO: 调用API添加词典规则
  dictionaryRules.value.push({
    id: Date.now().toString(),
    error: newDictRule.value.error,
    correct: newDictRule.value.correct,
    category: newDictRule.value.category,
    autoApply: newDictRule.value.autoApply
  })
  showAddDictModal.value = false
  newDictRule.value = { error: '', correct: '', category: 'drugs', autoApply: true }
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

function deleteDictRule(ruleId: string) {
  if (confirm('确定删除该规则吗？')) {
    dictionaryRules.value = dictionaryRules.value.filter(r => r.id !== ruleId)
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
              <span v-if="rule.autoApply" class="auto-badge">自动</span>
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
  </div>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.page-header {
  display: flex;
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

/* Tabs */
.admin-tabs {
  display: flex;
  background: white;
  border-bottom: 1px solid #eee;
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
  color: #666;
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
  background: white;
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
  color: #888;
}

.metric-cards {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  background: white;
  padding: 16px;
  border-radius: 12px;
}

.metric-card h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #666;
  font-weight: normal;
}

.metric-value {
  font-size: 28px;
  font-weight: 600;
  color: #333;
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
  background: white;
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
  color: #333;
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
  background: white;
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
  color: #888;
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
  background: white;
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
  color: #333;
}

.log-action {
  color: #666;
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
  color: #666;
}

.btn-primary {
  background: #667eea;
  color: white;
}
</style>
