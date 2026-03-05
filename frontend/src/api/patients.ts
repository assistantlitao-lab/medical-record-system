import request from '@/utils/request'

export interface Patient {
  id: string
  name: string
  card_no: string
  phone: string
  gender: string
  birthday: string
  id_card: string
  address: string
  allergy: string
  created_at: string
  last_visit_date: string | null
}

export interface CreatePatientParams {
  name: string
  card_no?: string
  phone?: string
  gender?: string
  birthday?: string
  id_card?: string
  address?: string
  allergy?: string
}

export function getPatients(keyword?: string) {
  return request.get('/patients', { params: { keyword } }) as Promise<{ code: number; data: { total: number; list: Patient[] } }>
}

export function getPatient(id: string) {
  return request.get(`/patients/${id}`) as Promise<{ code: number; data: Patient }>
}

export function createPatient(data: CreatePatientParams) {
  return request.post('/patients', data) as Promise<{ code: number; data: { id: string } }>
}

export function updatePatient(id: string, data: Partial<CreatePatientParams>) {
  return request.put(`/patients/${id}`, data)
}

export function deletePatient(id: string) {
  return request.delete(`/patients/${id}`)
}
