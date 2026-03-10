import request from '@/utils/request'

export interface Visit {
  id: string
  patient_id: string
  visit_no: string
  visit_date: string
  status: 'draft' | 'editing' | 'completed'
  template_id: string
  medical_record: {
    fields: Array<{
      field_key: string
      field_name: string
      content: string
      candidates: Array<{
        id: string
        text: string
        type: 'word' | 'phrase'
        confidence: number
      }>
    }>
  }
}

export interface Recording {
  id: string
  duration: number
  audio_url: string
  transcription: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

export function getVisits(patientId: string) {
  return request.get(`/patients/${patientId}/visits`) as Promise<{ code: number; data: { list: Visit[] } }>
}

export function getVisit(visitId: string) {
  return request.get(`/visits/${visitId}`) as Promise<{ code: number; data: Visit }>
}

export function createVisit(patientId: string) {
  return request.post(`/patients/${patientId}/visits`) as Promise<{ code: number; data: { id: string; visit_no: string } }>
}

export function saveVisit(visitId: string, data: any) {
  return request.put(`/visits/${visitId}`, data)
}

export function generateRecord(visitId: string, templateId: string, transcription?: string) {
  return request.post(`/visits/${visitId}/generate`, { template_id: templateId, transcription }) as Promise<{ code: number; data: any }>
}

export function lockVisit(visitId: string, deviceId: string) {
  return request.post(`/visits/${visitId}/lock`, { device_id: deviceId }) as Promise<{ code: number; data: { lock_token: string; expires_at: string } }>
}

export function exportVisit(visitId: string, format: 'pdf' | 'word') {
  return request.post(`/visits/${visitId}/export`, { format }) as Promise<{ code: number; data: { download_url: string } }>
}

// 录音相关
export function initUpload(visitId: string, data: { filename: string; file_size: number; duration: number; mime_type: string }) {
  return request.post(`/visits/${visitId}/recordings/init`, data) as Promise<{ code: number; data: { upload_id: string; chunk_size: number; max_chunks: number } }>
}

export function uploadChunk(uploadId: string, chunkIndex: number, chunk: Blob) {
  const formData = new FormData()
  formData.append('chunk', chunk)
  return request.post(`/recordings/${uploadId}/chunks/${chunkIndex}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export function completeUpload(uploadId: string, visitId: string, duration?: number) {
  return request.post(`/recordings/${uploadId}/complete`, { visit_id: visitId, duration }) as Promise<{ code: number; data: { recording_id: string } }>
}

export function startTranscribe(recordingId: string) {
  return request.post(`/recordings/${recordingId}/transcribe`) as Promise<{ code: number; data: { task_id: string } }>
}

export function getTranscribeStatus(recordingId: string) {
  return request.get(`/recordings/${recordingId}/status`) as Promise<{ code: number; data: { status: string; progress: number; transcription?: string } }>
}
