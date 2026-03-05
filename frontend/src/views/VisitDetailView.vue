<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const visitId = route.params.id as string
const patientId = route.query.patientId as string

// 状态
const currentStep = ref<'recording' | 'transcribing' | 'generating' | 'editing'>('recording')
const isRecording = ref(false)
const recordingTime = ref(0)
const transcription = ref('')
const generatedRecord = ref<any>(null)
const selectedTemplate = ref('')
const templates = ref<any[]>([])
const visitData = ref<any>(null)

// 编辑状态
const editingField = ref<string | null>(null)
const editContent = ref('')
const insertedCandidates = ref<Set<string>>(new Set())
const lockToken = ref('')

// 病历数据
const medicalRecord = ref<Record<string, any>>({})

// 录音列表
const recordings = ref<any[]>([])
const isUploading = ref(false)
const uploadProgress = ref(0)
const selectedRecording = ref<string | null>(null)

// 录音计时器
let recordingTimer: number | null = null
let ws: WebSocket | null = null

// 文件上传引用
const fileInput = ref<HTMLInputElement | null>(null)

// 获取转写状态文本
function getTranscriptionStatus(status: number) {
  const statusMap: Record<number, { text: string; class: string }> = {
    0: { text: '待转写', class: 'status-pending' },
    1: { text: '转写中', class: 'status-processing' },
    2: { text: '已完成', class: 'status-completed' },
    3: { text: '失败', class: 'status-failed' }
  }
  return statusMap[status] || { text: '未知', class: '' }
}

// 触发文件选择
function triggerFileUpload() {
  fileInput.value?.click()
}

// 处理文件上传
async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 验证文件类型
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/amr', 'audio/ogg', 'audio/webm']
  if (!allowedTypes.includes(file.type)) {
    alert('不支持的文件格式，请上传 MP3, WAV, M4A, AMR, OGG 格式的音频文件')
    return
  }

  // 验证文件大小 (最大 50MB)
  if (file.size > 50 * 1024 * 1024) {
    alert('文件大小不能超过 50MB')
    return
  }

  isUploading.value = true
  uploadProgress.value = 0

  try {
    const formData = new FormData()
    formData.append('audio', file)
    formData.append('visit_id', visitId)

    const res = await fetch('/api/v1/recordings/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      },
      body: formData
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || '上传失败')
    }

    const data = await res.json()
    if (data.code === 201) {
      alert('音频上传成功')
      // 重新加载就诊详情以获取新上传的录音
      await loadVisitDetail()
      // 如果上传成功且有录音，自动开始转写
      if (data.data.recording_id) {
        await startTranscription(data.data.recording_id)
      }
    }
  } catch (err: any) {
    console.error('上传失败:', err)
    alert(err.message || '上传失败')
  } finally {
    isUploading.value = false
    uploadProgress.value = 0
    // 清空文件输入
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}

// 开始转写
async function startTranscription(recordingId: string) {
  try {
    const res = await fetch(`/api/v1/recordings/${recordingId}/transcribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || '启动转写失败')
    }

    // 开始轮询转写状态
    pollTranscriptionStatus(recordingId)
  } catch (err: any) {
    console.error('启动转写失败:', err)
    alert(err.message || '启动转写失败')
  }
}

// 轮询转写状态
async function pollTranscriptionStatus(recordingId: string) {
  const checkStatus = async () => {
    try {
      const res = await fetch(`/api/v1/recordings/${recordingId}/status`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      })

      if (!res.ok) return

      const data = await res.json()
      if (data.code === 200) {
        // 更新录音列表中的状态
        const recording = recordings.value.find(r => r.id === recordingId)
        if (recording) {
          recording.status = data.data.status
          recording.transcription = data.data.transcription
        }

        // 如果转写完成，更新转写文本
        if (data.data.status === 'completed' && data.data.transcription) {
          transcription.value = data.data.transcription
          // 重新加载就诊详情
          await loadVisitDetail()
        } else if (data.data.status === 'processing' || data.data.status === 'pending') {
          // 继续轮询
          setTimeout(() => checkStatus(), 3000)
        }
      }
    } catch (e) {
      console.error('检查转写状态失败:', e)
    }
  }

  checkStatus()
}

// 播放录音
function playRecording(recordingId: string) {
  selectedRecording.value = recordingId
}

// 格式化文件大小
function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(async () => {
  // 加载模板列表
  await loadTemplates()

  if (visitId === 'new') {
    currentStep.value = 'recording'
  } else {
    // 加载已有病历
    await loadVisitDetail()
  }
})

async function loadTemplates() {
  try {
    const res = await fetch('/api/v1/templates', {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.code === 200) {
        templates.value = data.data.list
        if (templates.value.length > 0) {
          selectedTemplate.value = templates.value[0].id
        }
      }
    }
  } catch (e) {
    console.error('加载模板失败:', e)
  }
}

async function loadVisitDetail() {
  try {
    const res = await fetch(`/api/v1/visits/${visitId}`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (!res.ok) throw new Error('加载失败')

    const data = await res.json()
    if (data.code === 200) {
      visitData.value = data.data
      transcription.value = data.data.recordings?.[0]?.transcription || ''

      // 设置模板
      if (data.data.template_id) {
        selectedTemplate.value = data.data.template_id
      }

      // 加载录音列表
      recordings.value = data.data.recordings || []

      // 解析病历内容
      if (data.data.medical_record?.fields) {
        const fields: Record<string, any> = {}
        data.data.medical_record.fields.forEach((f: any) => {
          fields[f.field_key || f.name] = {
            name: f.label || f.name,
            content: f.content || '',
            candidates: []
          }
        })
        medicalRecord.value = fields
        currentStep.value = 'editing'
      } else if (data.data.recordings?.length > 0) {
        // 有录音但没有病历，显示编辑界面
        await initMedicalRecordFromTemplate()
        currentStep.value = 'editing'
      } else {
        // 没有录音也没有病历，显示录音界面
        currentStep.value = 'recording'
      }

      // 只有在编辑模式下才获取编辑锁
      if (currentStep.value === 'editing') {
        await acquireLock()
      }
    }
  } catch (e) {
    console.error('加载就诊详情失败:', e)
    alert('加载就诊详情失败')
    router.back()
  }
}

async function initMedicalRecordFromTemplate() {
  if (!selectedTemplate.value) return
  try {
    const res = await fetch(`/api/v1/templates/${selectedTemplate.value}`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.code === 200 && data.data.fields) {
        const fields: Record<string, any> = {}
        data.data.fields.forEach((f: any) => {
          fields[f.field_key] = {
            name: f.name,
            content: '',
            candidates: []
          }
        })
        medicalRecord.value = fields
      }
    }
  } catch (e) {
    console.error('加载模板详情失败:', e)
  }
}

async function acquireLock() {
  try {
    const res = await fetch(`/api/v1/visits/${visitId}/lock`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ device_id: 'browser' })
    })
    if (res.ok) {
      const data = await res.json()
      if (data.code === 200) {
        if (data.data.locked_by_other) {
          alert('该病历正在被其他设备编辑')
          return
        }
        lockToken.value = data.data.lock_token
      }
    }
  } catch (e) {
    console.error('获取编辑锁失败:', e)
  }
}

// 录音相关 - 使用WebSocket
function toggleRecording() {
  if (isRecording.value) {
    stopRecording()
  } else {
    startRecording()
  }
}

async function startRecording() {
  try {
    // 请求麦克风权限
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    isRecording.value = true
    recordingTime.value = 0
    recordingTimer = window.setInterval(() => {
      recordingTime.value++
    }, 1000)

    // 连接WebSocket
    const wsUrl = `ws://${window.location.host}/ws/v1/transcribe?token=${authStore.token}`
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('WebSocket connected')
      // 开始发送音频数据
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
          ws.send(event.data)
        }
      }
      mediaRecorder.start(100) // 每100ms发送一次数据
      ;(ws as any).mediaRecorder = mediaRecorder
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'transcription' && msg.data.text) {
        transcription.value += msg.data.text + '\n'
      }
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
  } catch (err) {
    console.error('启动录音失败:', err)
    alert('无法访问麦克风，请检查权限设置')
  }
}

function stopRecording() {
  isRecording.value = false
  if (recordingTimer) {
    clearInterval(recordingTimer)
    recordingTimer = null
  }

  // 停止WebSocket和录音
  if (ws) {
    if ((ws as any).mediaRecorder) {
      (ws as any).mediaRecorder.stop()
    }
    ws.close()
    ws = null
  }

  // 开始转写/生成
  startTranscribing()
}

async function startTranscribing() {
  currentStep.value = 'transcribing'

  // 如果有转写文本，直接生成病历
  if (transcription.value.trim()) {
    startGenerating()
  } else {
    // 等待一段时间让最后的转写结果到达
    setTimeout(() => {
      if (transcription.value.trim()) {
        startGenerating()
      } else {
        alert('没有识别到语音，请重试')
        currentStep.value = 'recording'
      }
    }, 2000)
  }
}

async function startGenerating() {
  currentStep.value = 'generating'

  try {
    const res = await fetch(`/api/v1/visits/${visitId}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_id: selectedTemplate.value,
        transcription: transcription.value
      })
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || '生成失败')
    }

    const data = await res.json()
    if (data.code === 200) {
      // 解析生成的病历字段
      const fields: Record<string, any> = {}
      if (data.data.fields) {
        data.data.fields.forEach((f: any) => {
          fields[f.field_key || f.name] = {
            name: f.label || f.name,
            content: f.content || '',
            candidates: f.candidates || []
          }
        })
      }
      medicalRecord.value = fields
      currentStep.value = 'editing'
    }
  } catch (err: any) {
    console.error('生成病历失败:', err)
    alert(err.message || '生成病历失败，请重试')
    currentStep.value = 'recording'
  }
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
  const secs = (seconds % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function formatDateTime(dateStr: string) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(seconds: number) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 编辑相关
function startEditField(fieldKey: string) {
  editingField.value = fieldKey
  editContent.value = medicalRecord.value[fieldKey]?.content || ''
}

function saveFieldEdit(fieldKey: string) {
  if (medicalRecord.value[fieldKey]) {
    medicalRecord.value[fieldKey].content = editContent.value
  }
  editingField.value = null
}

function cancelFieldEdit() {
  editingField.value = null
  editContent.value = ''
}

// 候选词相关
function isCandidateInserted(candidateId: string) {
  return insertedCandidates.value.has(candidateId)
}

function toggleCandidate(candidate: any, fieldKey: string, candidateId: string) {
  if (insertedCandidates.value.has(candidateId)) {
    removeCandidate(candidate, fieldKey, candidateId)
  } else {
    insertCandidate(candidate, fieldKey, candidateId)
  }
}

function insertCandidate(candidate: any, fieldKey: string, candidateId: string) {
  const field = medicalRecord.value[fieldKey]
  const text = typeof candidate === 'string' ? candidate : candidate.text
  if (editingField.value === fieldKey) {
    editContent.value += text
  } else {
    field.content += text
  }
  insertedCandidates.value.add(candidateId)
}

function removeCandidate(candidate: any, fieldKey: string, candidateId: string) {
  const field = medicalRecord.value[fieldKey]
  const text = typeof candidate === 'string' ? candidate : candidate.text
  if (editingField.value === fieldKey) {
    editContent.value = editContent.value.replace(text, '')
  } else {
    field.content = field.content.replace(text, '')
  }
  insertedCandidates.value.delete(candidateId)
}

async function saveMedicalRecord() {
  try {
    // 转换字段格式
    const fields = Object.entries(medicalRecord.value).map(([key, value]) => ({
      field_key: key,
      content: value.content
    }))

    const res = await fetch(`/api/v1/visits/${visitId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lock_token: lockToken.value,
        template_id: selectedTemplate.value,
        fields: fields,
        status: 2 // completed
      })
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || '保存失败')
    }

    alert('病历已保存')
    router.back()
  } catch (err: any) {
    console.error('保存失败:', err)
    if (err.message?.includes('锁')) {
      alert('编辑已过期，请重新打开')
    } else {
      alert(err.message || '保存失败')
    }
  }
}

async function exportRecord() {
  // 简单的打印/导出功能
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    const content = `
      <html>
        <head><title>病历导出</title></head>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>病历记录</h1>
          ${Object.entries(medicalRecord.value).map(([key, value]) => `
            <div style="margin-bottom: 20px;">
              <h3 style="margin-bottom: 8px; color: #333;">${value.name}</h3>
              <p style="line-height: 1.6; margin: 0;">${value.content}</p>
            </div>
          `).join('')}
        </body>
      </html>
    `
    printWindow.document.write(content)
    printWindow.document.close()
    printWindow.print()
  }
}
</script>

<template>
  <div class="visit-detail-page">
    <!-- 录音阶段 -->
    <div v-if="currentStep === 'recording'" class="recording-step">
      <header class="page-header">
        <button class="back-btn" @click="router.back()">←</button>
        <h1>录音采集</h1>
        <span class="placeholder"></span>
      </header>

      <div class="recording-area">
        <!-- 实时录音区域 -->
        <div class="recording-visual">
          <div :class="['recording-circle', { 'recording': isRecording }]">
            <div class="mic-icon">🎤</div>
          </div>
          <div class="recording-waves" v-if="isRecording">
            <span v-for="i in 5" :key="i" :style="{ animationDelay: `${i * 0.1}s` }"></span>
          </div>
        </div>

        <div class="recording-time">{{ formatTime(recordingTime) }}</div>
        <p class="recording-hint">
          {{ isRecording ? '正在录音...' : '点击开始录音' }}
        </p>

        <button :class="['record-btn', { 'recording': isRecording }]" @click="toggleRecording">
          <span class="record-inner"></span>
        </button>

        <p class="quality-hint">
          提示: 请保持环境安静，手机距离患者30-50厘米
        </p>

        <!-- 分隔线 -->
        <div class="divider">
          <span>或</span>
        </div>

        <!-- 音频上传区域 -->
        <div class="upload-section">
          <input
            ref="fileInput"
            type="file"
            accept="audio/*"
            style="display: none"
            @change="handleFileUpload"
          />
          <button
            class="upload-btn"
            @click="triggerFileUpload"
            :disabled="isUploading"
          >
            <span v-if="isUploading">
              <span class="spinner-small"></span>
              上传中 {{ uploadProgress }}%
            </span>
            <span v-else>📁 上传音频文件</span>
          </button>
          <p class="upload-hint">支持 MP3, WAV, M4A, AMR, OGG 格式，最大 50MB</p>
        </div>

        <!-- 已有录音列表 -->
        <div v-if="recordings.length > 0" class="recordings-list">
          <h3>已上传录音 ({{ recordings.length }})</h3>
          <div
            v-for="recording in recordings"
            :key="recording.id"
            class="recording-item"
          >
            <div class="recording-info">
              <span class="recording-name">录音 {{ formatDate(recording.created_at) }}</span>
              <span :class="['status-badge', getTranscriptionStatus(recording.status).class]">
                {{ getTranscriptionStatus(recording.status).text }}
              </span>
            </div>
            <div class="recording-actions">
              <button
                v-if="recording.audio_url"
                class="play-btn"
                @click="playRecording(recording.id)"
              >
                ▶ 播放
              </button>
              <button
                v-if="recording.status === 0 || recording.status === 3"
                class="transcribe-btn"
                @click="startTranscription(recording.id)"
              >
                转写
              </button>
            </div>
            <!-- 音频播放器 -->
            <audio
              v-if="selectedRecording === recording.id && recording.audio_url"
              :src="recording.audio_url.startsWith('http') ? recording.audio_url : `/uploads/${recording.audio_url}`"
              controls
              class="audio-player"
              autoplay
            ></audio>
          </div>
        </div>
      </div>
    </div>

    <!-- 转写中 -->
    <div v-else-if="currentStep === 'transcribing'" class="processing-step">
      <div class="processing-content">
        <div class="spinner"></div>
        <h2>语音识别中...</h2>
        <p>正在将录音转换为文字</p>
        <div class="transcription-preview" v-if="transcription">
          <p v-for="(line, idx) in transcription.split('\n')" :key="idx">{{ line }}</p>
        </div>
      </div>
    </div>

    <!-- AI生成中 -->
    <div v-else-if="currentStep === 'generating'" class="processing-step">
      <div class="processing-content">
        <div class="spinner"></div>
        <h2>AI生成病历中...</h2>
        <p>正在分析对话内容并生成规范病历</p>
        <p class="sub-hint">预计需要10-30秒</p>
      </div>
    </div>

    <!-- 编辑阶段 -->
    <div v-else-if="currentStep === 'editing'" class="editing-step">
      <header class="page-header">
        <div class="header-left">
          <button class="back-btn" @click="router.back()">←</button>
          <h1>病历编辑</h1>
        </div>
        <div class="header-actions">
          <button class="action-btn" @click="exportRecord">导出</button>
          <button class="save-btn" @click="saveMedicalRecord">保存</button>
        </div>
      </header>

      <!-- 录音列表 -->
      <div v-if="recordings.length > 0" class="recordings-section">
        <h3>📹 录音列表 ({{ recordings.length }})</h3>
        <div class="recordings-grid">
          <div
            v-for="recording in recordings"
            :key="recording.id"
            class="recording-card"
          >
            <div class="recording-header">
              <span class="recording-time">{{ formatDateTime(recording.created_at) }}</span>
              <span :class="['status-badge', getTranscriptionStatus(recording.status).class]">
                {{ getTranscriptionStatus(recording.status).text }}
              </span>
            </div>
            <div class="recording-body">
              <div v-if="recording.duration" class="recording-duration">
                ⏱ {{ formatDuration(recording.duration) }}
              </div>
              <div v-if="recording.file_size" class="recording-size">
                📦 {{ formatFileSize(recording.file_size) }}
              </div>
            </div>
            <div class="recording-footer">
              <audio
                v-if="recording.audio_url"
                :src="recording.audio_url.startsWith('http') ? recording.audio_url : `/uploads/${recording.audio_url}`"
                controls
                class="audio-player-small"
              ></audio>
              <button
                v-if="(recording.status === 0 || recording.status === 3) && recording.transcription"
                class="retry-btn"
                @click="startTranscription(recording.id)"
              >
                重新转写
              </button>
            </div>
            <div v-if="recording.transcription" class="transcription-preview-small">
              <p>{{ recording.transcription.substring(0, 100) }}{{ recording.transcription.length > 100 ? '...' : '' }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 模板选择 -->
      <div class="template-bar">
        <span class="label">模板:</span>
        <select v-model="selectedTemplate" class="template-select">
          <option v-for="tpl in templates" :key="tpl.id" :value="tpl.id">{{ tpl.name }}</option>
        </select>
      </div>

      <!-- 病历内容 -->
      <div class="medical-record">
        <div
          v-for="(field, key) in medicalRecord"
          :key="key"
          class="field-section"
        >
          <div class="field-header">
            <h3>{{ field.name }}</h3>
            <button
              v-if="editingField !== key"
              class="edit-field-btn"
              @click="startEditField(key as string)"
            >
              编辑
            </button>
            <div v-else class="edit-actions">
              <button class="cancel-btn" @click="cancelFieldEdit">取消</button>
              <button class="confirm-btn" @click="saveFieldEdit(key as string)">确认</button>
            </div>
          </div>

          <div class="field-content">
            <div v-if="editingField === key" class="edit-area">
              <textarea
                v-model="editContent"
                class="edit-textarea"
                rows="4"
              ></textarea>

              <!-- 候选词面板 -->
              <div class="candidates-panel" v-if="field.candidates?.length">
                <p class="candidates-title">🤖 点击添加候选词</p>
                <div class="candidates-list">
                  <button
                    v-for="(candidate, idx) in field.candidates"
                    :key="idx"
                    :class="['candidate-btn', { 'inserted': isCandidateInserted(key + '-' + idx) }]"
                    @click="toggleCandidate(candidate, key as string, key + '-' + idx)"
                  >
                    {{ isCandidateInserted(key + '-' + idx) ? '✓' : '' }}{{ candidate.text || candidate }}
                  </button>
                </div>
              </div>
            </div>
            <p v-else class="content-text">{{ field.content }}</p>
          </div>
        </div>
      </div>

      <!-- 原始转写文本 -->
      <div class="transcription-section">
        <h3 @click="($event.target as HTMLElement).nextElementSibling?.classList.toggle('expanded')">
          原始转写文本 ▼
        </h3>
        <div class="transcription-content">
          <p v-for="(line, idx) in transcription.split('\n')" :key="idx">{{ line }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.visit-detail-page {
  min-height: 100vh;
  background: #f5f5f5;
}

/* Header */
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

.placeholder {
  width: 40px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.action-btn, .save-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.action-btn {
  background: #f0f0f0;
  border: none;
  color: #666;
}

.save-btn {
  background: #667eea;
  border: none;
  color: white;
}

/* Recording Step */
.recording-step {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.recording-step .page-header {
  background: transparent;
  border-bottom: none;
  color: white;
}

.recording-step .back-btn {
  color: white;
}

.recording-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  min-height: calc(100vh - 60px);
}

@media (max-width: 768px) {
  .recording-area {
    padding: 40px 20px;
  }
}

.recording-visual {
  position: relative;
  margin-bottom: 30px;
}

.recording-circle {
  width: 150px;
  height: 150px;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s;
}

.recording-circle.recording {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.mic-icon {
  font-size: 60px;
}

.recording-waves {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  align-items: flex-end;
  height: 30px;
}

.recording-waves span {
  width: 4px;
  background: white;
  border-radius: 2px;
  animation: wave 0.5s ease-in-out infinite alternate;
}

@keyframes wave {
  from { height: 5px; }
  to { height: 25px; }
}

.recording-time {
  font-size: 48px;
  font-weight: 300;
  margin-bottom: 10px;
  font-variant-numeric: tabular-nums;
}

.recording-hint {
  font-size: 16px;
  opacity: 0.9;
  margin-bottom: 40px;
}

.record-btn {
  width: 80px;
  height: 80px;
  background: white;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
}

.record-btn.recording {
  background: #ff4444;
}

.record-inner {
  width: 30px;
  height: 30px;
  background: #ff4444;
  border-radius: 50%;
  transition: all 0.3s;
}

.record-btn.recording .record-inner {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  background: white;
}

.quality-hint {
  margin-top: 40px;
  font-size: 13px;
  opacity: 0.7;
  text-align: center;
}

/* Divider */
.divider {
  display: flex;
  align-items: center;
  margin: 40px 0;
  width: 100%;
  max-width: 400px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.3);
}

.divider span {
  padding: 0 20px;
  font-size: 14px;
  opacity: 0.8;
}

/* Upload Section */
.upload-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.upload-btn {
  padding: 14px 32px;
  background: rgba(255,255,255,0.2);
  border: 2px dashed rgba(255,255,255,0.5);
  border-radius: 12px;
  color: white;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.upload-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.3);
  border-color: white;
}

.upload-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinner-small {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.upload-hint {
  font-size: 12px;
  opacity: 0.6;
  text-align: center;
}

/* Recordings List */
.recordings-list {
  margin-top: 40px;
  width: 100%;
  max-width: 600px;
  background: rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 20px;
}

.recordings-list h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 500;
}

.recording-item {
  background: rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 10px;
}

.recording-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.recording-name {
  font-size: 14px;
  font-weight: 500;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.status-pending {
  background: #ffc107;
  color: #333;
}

.status-processing {
  background: #17a2b8;
  color: white;
}

.status-completed {
  background: #28a745;
  color: white;
}

.status-failed {
  background: #dc3545;
  color: white;
}

.recording-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.play-btn,
.transcribe-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.play-btn {
  background: white;
  color: #667eea;
}

.transcribe-btn {
  background: #28a745;
  color: white;
}

.play-btn:hover,
.transcribe-btn:hover {
  opacity: 0.9;
}

.audio-player {
  width: 100%;
  margin-top: 8px;
}

/* Processing Steps */
.processing-step {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
}

.processing-content {
  text-align: center;
  padding: 40px;
}

.spinner {
  width: 60px;
  height: 60px;
  border: 4px solid #f0f0f0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 30px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.processing-content h2 {
  font-size: 20px;
  margin-bottom: 10px;
  color: #333;
}

.processing-content p {
  color: #888;
  margin-bottom: 10px;
}

.sub-hint {
  font-size: 13px;
}

.transcription-preview {
  margin-top: 30px;
  padding: 20px;
  background: #f8f8f8;
  border-radius: 12px;
  text-align: left;
  max-width: 500px;
}

.transcription-preview p {
  margin: 6px 0;
  font-size: 14px;
  color: #555;
}

/* Editing Step */
.editing-step {
  padding-bottom: 40px;
}

.template-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 40px;
  background: white;
  margin-bottom: 12px;
}

@media (max-width: 768px) {
  .template-bar {
    padding: 12px 16px;
  }
}

.template-bar .label {
  font-size: 14px;
  color: #666;
}

.template-select {
  flex: 1;
  max-width: 400px;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.medical-record {
  padding: 0 40px;
  max-width: 1600px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .medical-record {
    padding: 0 16px;
  }
}

.field-section {
  background: white;
  border-radius: 12px;
  margin-bottom: 12px;
  overflow: hidden;
}

.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #f8f8f8;
  border-bottom: 1px solid #eee;
}

.field-header h3 {
  margin: 0;
  font-size: 15px;
  color: #333;
}

.edit-field-btn {
  padding: 4px 12px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.edit-actions {
  display: flex;
  gap: 8px;
}

.cancel-btn, .confirm-btn {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  border: none;
}

.cancel-btn {
  background: #f0f0f0;
  color: #666;
}

.confirm-btn {
  background: #667eea;
  color: white;
}

.field-content {
  padding: 16px;
}

.content-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
}

/* Edit Area */
.edit-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #667eea;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
}

/* Candidates Panel */
.candidates-panel {
  background: #f8f9ff;
  border: 1px solid #e0e4ff;
  border-radius: 10px;
  padding: 12px;
}

.candidates-title {
  margin: 0 0 10px 0;
  font-size: 13px;
  color: #667eea;
}

.candidates-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.candidate-btn {
  padding: 6px 12px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 16px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: all 0.2s;
}

.candidate-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.candidate-btn.inserted {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

/* Transcription Section */
.transcription-section {
  margin: 20px 12px;
  background: white;
  border-radius: 12px;
  overflow: hidden;
}

.transcription-section h3 {
  margin: 0;
  padding: 14px 16px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  background: #f8f8f8;
}

.transcription-content {
  padding: 16px;
  display: none;
}

.transcription-content.expanded {
  display: block;
}

.transcription-content p {
  margin: 6px 0;
  font-size: 13px;
  color: #666;
}

/* Recordings Section in Editing */
.recordings-section {
  padding: 20px 40px;
  max-width: 1600px;
  margin: 0 auto 20px;
}

.recordings-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #333;
}

.recordings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.recording-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.recording-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.recording-header .recording-time {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.recording-body {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #666;
}

.recording-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.audio-player-small {
  flex: 1;
  height: 36px;
}

.retry-btn {
  padding: 6px 12px;
  background: #f0f0f0;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
}

.retry-btn:hover {
  background: #e0e0e0;
}

.transcription-preview-small {
  margin-top: 12px;
  padding: 10px;
  background: #f8f8f8;
  border-radius: 8px;
  font-size: 13px;
  color: #666;
}

.transcription-preview-small p {
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .recordings-section {
    padding: 16px;
  }

  .recordings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
