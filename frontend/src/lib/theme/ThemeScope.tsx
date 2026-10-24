import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { useThemeStore, type Theme } from './theme'

interface Props {
  /** `fixed:'light'` ignora a preferência do usuário (usado no chat). */
  fixed?: Theme
  className?: string
  children: ReactNode
}

/** Aplica os tokens de cor ao subtree. Chat: fixed="light". Dashboard: segue o toggle. */
export function ThemeScope({ fixed, className, children }: Props) {
  const userTheme = useThemeStore((s) => s.theme)
  return (
    <div
      data-theme={fixed ?? userTheme}
      className={cn('min-h-screen bg-bg text-ink', className)}
    >
      {children}
    </div>
  )
}
