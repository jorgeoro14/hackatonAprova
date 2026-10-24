import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '@/lib/theme/theme'

export function ThemeToggle() {
  const { theme, toggle } = useThemeStore()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:text-ink"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
