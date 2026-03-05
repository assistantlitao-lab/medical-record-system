import request from '@/utils/request'

export interface User {
  id: string
  name: string
  phone: string
  created_at: string
  last_login_at: string
  record_count: number
}

export interface DictRule {
  id: string
  error: string
  correct: string
  category: string
  frequency: number
  auto_apply: boolean
}

export function getUsers() {
  return request.get('/admin/users') as Promise<{ code: number; data: { list: User[] } }>
}

export function createUser(data: { name: string; phone: string; password: string }) {
  return request.post('/admin/users', data)
}

export function deleteUser(userId: string) {
  return request.delete(`/admin/users/${userId}`)
}

export function getDictionary(keyword?: string) {
  return request.get('/admin/dictionary', { params: { keyword } }) as Promise<{ code: number; data: { list: DictRule[] } }>
}

export function createDictRule(data: { error: string; correct: string; category: string; auto_apply: boolean }) {
  return request.post('/admin/dictionary', data)
}

export function deleteDictRule(ruleId: string) {
  return request.delete(`/admin/dictionary/${ruleId}`)
}

export function getMetrics() {
  return request.get('/admin/metrics') as Promise<{ code: number; data: any }>
}

export function getLogs(params?: { user_id?: string; action?: string; start_date?: string; end_date?: string; page?: number }) {
  return request.get('/admin/logs', { params }) as Promise<{ code: number; data: { list: any[] } }>
}
