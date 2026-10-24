import type { HTMLAttributes, ReactNode } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-line/60', className)} {...rest} />
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <Inbox className="text-muted" size={28} />
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message = 'Não foi possível carregar os dados.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-danger/40 bg-danger/5 px-6 py-10 text-center">
      <AlertTriangle className="text-danger" size={28} />
      <p className="text-sm text-ink">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-sm font-medium text-petrol underline">
          Tentar novamente
        </button>
      )}
    </div>
  )
}
