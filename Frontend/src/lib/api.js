export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')
export const AI_URL = (import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '')

export async function api(path, options = {}) {
  const headers = { ...options.headers }
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (response.status === 204) return null
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || body.detail || `Request failed (${response.status})`)
  return body.data ?? body
}

export function formatDuration(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const secs = Math.floor(value % 60)
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':')
}

export function formatTime(value) {
  return value ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'
}

export function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}
