import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className={cn('w-full border-collapse text-sm', className)} {...rest} />
    </div>
  )
}

export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead className="bg-soft/60" {...p} />
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y divide-line" {...p} />

export function TR({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors', rest.onClick && 'cursor-pointer hover:bg-soft/50', className)} {...rest} />
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted', className)} {...rest} />
}

export function TD({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 text-ink', className)} {...rest} />
}
