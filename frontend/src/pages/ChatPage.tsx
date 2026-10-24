import { useTitle } from '@/lib/utils/useTitle'
import { useQueryClient } from '@tanstack/react-query'
import { useChatSessionStore } from '@/lib/api/authStore'
import { ThemeScope } from '@/lib/theme/ThemeScope'
import { ChatWindow } from '@/features/chat/ChatWindow'
import { IdentifyFlow } from '@/features/chat/IdentifyFlow'
import { useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

/** Chat público da prefeitura: sempre tema claro, sem login. */
export function ChatPage() {
  useTitle('Assistente de implantação')
  const { sessionId, sessionToken, contact, set, clear } = useChatSessionStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // /chat?reset: recomeça a demo do zero (limpa sessão e conversas simuladas)
  useEffect(() => {
    if (!params.has('reset')) return
    try { localStorage.removeItem('mock.chatSessions') } catch { /* ignora */ }
    qc.removeQueries({ queryKey: ['chat'] })
    clear()
    navigate('/chat', { replace: true })
  }, [params, qc, clear, navigate])

  const exit = useCallback(() => {
    qc.removeQueries({ queryKey: ['chat'] })
    clear()
  }, [qc, clear])

  return (
    <ThemeScope fixed="light">
      {sessionId && sessionToken && contact ? (
        <ChatWindow sessionId={sessionId} sessionToken={sessionToken} contact={contact} onExit={exit} />
      ) : (
        <IdentifyFlow onReady={set} />
      )}
    </ThemeScope>
  )
}
