import { clearAuth, getToken } from './auth'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`/api${path}`, { ...options, headers })
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T

  if (response.status === 401) {
    clearAuth()
    if (!location.hash.includes('/login')) location.hash = '#/login'
    throw new ApiError(data.error || '请先登录', 401)
  }
  if (!response.ok) {
    throw new ApiError(data.error || '请求失败', response.status)
  }
  return data
}
