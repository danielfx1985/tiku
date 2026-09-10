export type UserRole = 'admin' | 'user'

export interface AuthUser {
  id: string
  username: string
  role?: UserRole
}

const TOKEN_KEY = 'quiz-token'
const USER_KEY = 'quiz-user'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isLoggedIn(): boolean {
  return Boolean(getToken())
}

export function isAdmin(): boolean {
  return getUser()?.role === 'admin'
}
