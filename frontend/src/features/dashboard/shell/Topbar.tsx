import { useQueryClient } from '@tanstack/react-query'
import { LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '@/components/ui'
import { authApi } from '@/lib/api/endpoints'
import { useAuthStore } from '@/lib/api/authStore'
import { useImplementers } from '@/lib/api/hooks'
import { cn } from '@/lib/utils/cn'
import { PERIODS, useFilters, type PeriodKey } from '../filters'

const control = 'h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-cyan'

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const user = useAuthStore((s) => s.user)!
  const logout = useAuthStore((s) => s.logout)
  const { period, setPeriod, implementerId, setImplementerId } = useFilters()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isHead = user.role === 'head'
  const implementers = useImplementers(isHead)

  const signOut = async () => {
    await authApi.logout().catch(() => undefined)
    logout()
    setImplementerId(null)
    qc.clear()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur">
      <button type="button" onClick={onMenu} aria-label="Abrir menu" className="text-muted lg:hidden">
        <Menu size={22} />
      </button>

      {isHead && (
        <select
          aria-label="Implantador"
          value={implementerId ?? ''}
          onChange={(e) => setImplementerId(e.target.value || null)}
          className={cn(control, 'w-52')}
        >
          <option value="">Todos os implantadores</option>
          {implementers.data?.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      )}

      <select aria-label="Período" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className={cn(control, 'sm:hidden')}>
        {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>

      <div role="group" aria-label="Período" className="hidden items-center rounded-lg border border-line bg-surface p-0.5 sm:flex">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            aria-pressed={period === p.key}
            className={cn('rounded-md px-3 py-1 text-sm transition', period === p.key ? 'bg-soft font-medium text-petrol' : 'text-muted hover:text-ink')}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-muted md:block">{user.name}</span>
        <ThemeToggle />
        <button
          type="button"
          onClick={signOut}
          aria-label="Sair"
          title="Sair"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:text-ink"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
