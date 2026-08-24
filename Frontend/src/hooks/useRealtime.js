import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../lib/api'

export function useRealtime(onEvent) {
  const [connected, setConnected] = useState(false)
  const callback = useRef(onEvent)
  useEffect(() => { callback.current = onEvent }, [onEvent])

  useEffect(() => {
    let socket
    let retry
    let closed = false
    const connect = () => {
      socket = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws`)
      socket.onopen = () => setConnected(true)
      socket.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 1500)
      }
      socket.onmessage = (message) => {
        try { callback.current?.(JSON.parse(message.data)) } catch { /* ignore malformed server events */ }
      }
    }
    connect()
    return () => { closed = true; clearTimeout(retry); socket?.close() }
  }, [])
  return connected
}
