import { api } from './api'
import { setAuth, type AuthUser } from './auth'

export async function login(username: string, password: string): Promise<AuthUser> {
  const data = await api<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setAuth(data.token, data.user)
  return data.user
}

export async function register(username: string, password: string): Promise<AuthUser> {
  const data = await api<{ token: string; user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setAuth(data.token, data.user)
  return data.user
}
