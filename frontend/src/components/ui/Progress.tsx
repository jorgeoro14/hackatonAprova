import { cn } from '@/lib/utils/cn'

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 overflow-hidden rounded-full bg-soft', className)}
    >
      <div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${v}%` }} />
    </div>
  )
}
