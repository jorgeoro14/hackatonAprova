import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card, Skeleton } from '@/components/ui'
import { formatDelta } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

interface Props {
  title: string
  value?: string
  /** Texto de apoio abaixo do valor (ex.: "sem IA: 99 reuniões"). */
  caption?: string
  /** Variação percentual vs. baseline; `goodWhen` diz qual direção é sucesso. */
  deltaPct?: number | null
  goodWhen?: 'down' | 'up'
  chart?: ReactNode
  loading?: boolean
}

export function KpiCard({ title, value, caption, deltaPct, goodWhen = 'down', chart, loading }: Props) {
  const good = deltaPct == null || deltaPct === 0 ? undefined : goodWhen === 'down' ? deltaPct < 0 : deltaPct > 0
  const Arrow = deltaPct != null && deltaPct > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-sm text-muted">{title}</p>
      {loading ? (
        <>
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-full" />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <p className="tabular font-title text-3xl font-semibold text-ink">{value}</p>
            {deltaPct != null && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
                  good === undefined ? 'bg-soft text-muted' : good ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
                )}
              >
                <Arrow size={14} />
                {formatDelta(deltaPct)}
              </span>
            )}
          </div>
          {caption && <p className="text-xs text-muted">{caption}</p>}
          {chart}
        </>
      )}
    </Card>
  )
}
