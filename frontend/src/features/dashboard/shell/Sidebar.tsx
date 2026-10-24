import { Logo } from '@/components/ui'
import { NavLink } from 'react-router-dom'
import { Building2, LayoutDashboard, Users, X } from 'lucide-react'
import type { Role } from '@/types/schemas'
import { cn } from '@/lib/utils/cn'

const items: { to: string; label: string; icon: typeof Users; end?: boolean; roles: Role[] }[] = [
  { to: '/dashboard', label: 'Visão geral', icon: LayoutDashboard, end: true, roles: ['implementer', 'head'] },
  { to: '/dashboard/clients', label: 'Clientes', icon: Building2, roles: ['implementer', 'head'] },
  { to: '/dashboard/team', label: 'Time', icon: Users, roles: ['head'] },
]

interface Props {
  role: Role
  open: boolean
  onClose: () => void
}

export function Sidebar({ role, open, onClose }: Props) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : 'invisible -translate-x-full lg:visible',
        )}
      >
        <div className="flex h-14 items-center justify-between px-5">
          <Logo className="h-5" />
          <button type="button" onClick={onClose} aria-label="Fechar menu" className="text-muted lg:hidden">
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2" aria-label="Principal">
          {items
            .filter((i) => i.roles.includes(role))
            .map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                    isActive ? 'bg-soft font-medium text-petrol' : 'text-muted hover:bg-soft/60 hover:text-ink',
                  )
                }
              >
                <Icon size={18} /> {label}
              </NavLink>
            ))}
        </nav>
        <p className="mt-auto px-5 py-4 text-xs text-muted">
          {role === 'head' ? 'Head de implantação' : 'Implantador'}
        </p>
      </aside>
    </>
  )
}
