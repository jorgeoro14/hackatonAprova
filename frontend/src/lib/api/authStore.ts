import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types/schemas'

interface AuthState {
  token: string | null
  expiresAt: string | null
  user: User | null
  setAuth: (a: { token: string; expiresAt: string; user: User }) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      user: null,
      setAuth: ({ token, expiresAt, user }) => set({ token, expiresAt, user }),
      logout: () => set({ token: null, expiresAt: null, user: null }),
    }),
    { name: 'aprova.auth' },
  ),
)

/** Sessão do chat público (sem login): guardada para retomar a conversa. */
interface ChatSessionState {
  sessionId: string | null
  sessionToken: string | null
  set: (s: { sessionId: string; sessionToken: string }) => void
  clear: () => void
}

export const useChatSessionStore = create<ChatSessionState>()(
  persist(
    (set) => ({
      sessionId: null,
      sessionToken: null,
      set: ({ sessionId, sessionToken }) => set({ sessionId, sessionToken }),
      clear: () => set({ sessionId: null, sessionToken: null }),
    }),
    { name: 'aprova.chatSession' },
  ),
)
