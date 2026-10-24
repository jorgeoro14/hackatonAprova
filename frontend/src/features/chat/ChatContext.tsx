import { createContext, useContext } from 'react'

interface ChatSession {
  sessionId: string
  sessionToken: string
}

const Ctx = createContext<ChatSession | null>(null)
export const ChatSessionProvider = Ctx.Provider
export const useChatSession = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('useChatSession fora do ChatSessionProvider')
  return s
}
