export interface AdminSession {
  authenticated: boolean
  authorized: boolean
  user: {
    id: string
    name: string
    email: string
    avatar: string
    username: string
    role: 'user' | 'admin'
  } | null
}
