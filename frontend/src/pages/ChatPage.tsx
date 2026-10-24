import { useTitle } from '@/lib/utils/useTitle'
import { useQueryClient } from '@tanstack/react-query'
import { useChatSessionStore } from '@/lib/api/authStore'
import { ThemeScope } from '@/lib/theme/ThemeScope'
import { ChatWindow } from '@/features/chat/ChatWindow'
import { IdentifyFlow } from '@/features/chat/IdentifyFlow'
import { useCallback } from 'react'

/** Chat público da prefeitura: sempre tema claro, sem login. */
export function ChatPage() {
  useTitle('Assistente de implantação')
  const { sessionId, sessionToken, contact, set, clear } = useChatSessionStore()
  const qc = useQueryClient()

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
