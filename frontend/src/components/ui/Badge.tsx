import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-soft text-muted',
  info: 'bg-soft text-petrol',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}
