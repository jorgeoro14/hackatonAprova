import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light'

interface ThemeState {
  /** Tema escolhido pelo usuário para o dashboard (padrão: escuro). */
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggle: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
    }),
    { name: 'aprova.theme' },
  ),
)
