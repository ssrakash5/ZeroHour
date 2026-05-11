import { useEffect, useRef, useCallback } from 'react'

export function useWebSocket(factory, onMessage) {
  const wsRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = factory()
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          onMessageRef.current(data)
        } catch {}
      }

      ws.onclose = () => {
        // Reconnect after 2s on unexpected close
        setTimeout(connect, 2000)
      }
    } catch {}
  }, [factory])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return wsRef
}
