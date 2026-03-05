import request from '@/utils/request'

export interface LoginParams {
  phone: string
  password: string
}

export interface LoginResult {
  token: string
  user_id: string
  name: string
  expires_in: number
  is_admin: boolean
}

export function login(data: LoginParams) {
  return request.post('/auth/login', data) as Promise<{ code: number; data: LoginResult }>
}

export function logout() {
  return request.post('/auth/logout')
}

export function refreshToken() {
  return request.post('/auth/refresh')
}
