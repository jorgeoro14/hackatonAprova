import { cn } from '@/lib/utils/cn'

interface Props<T extends string> {
  tabs: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}

export function Tabs<T extends string>({ tabs, value, onChange }: Props<T>) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition',
            value === t.id ? 'border-cyan font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
