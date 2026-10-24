import { create } from 'zustand'
import type { Scope } from '@/lib/api/endpoints'
import { useAuthStore } from '@/lib/api/authStore'

export type PeriodKey = '7d' | '30d' | '90d'

export const PERIODS: { key: PeriodKey; label: string; days: number }[] = [
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
]

interface FiltersState {
  period: PeriodKey
  /** Só a head usa: drill-down por implantador. */
  implementerId: string | null
  setPeriod: (p: PeriodKey) => void
  setImplementerId: (id: string | null) => void
}

export const useFilters = create<FiltersState>((set) => ({
  period: '30d',
  implementerId: null,
  setPeriod: (period) => set({ period }),
  setImplementerId: (implementerId) => set({ implementerId }),
}))

/** Escopo (período + implantador) pronto para passar às queries. */
export function useScope(): Scope {
  const { period, implementerId } = useFilters()
  const role = useAuthStore((s) => s.user?.role)
  const days = PERIODS.find((p) => p.key === period)!.days
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  const day = (d: Date) => d.toISOString().slice(0, 10)
  return {
    from: day(from),
    to: day(to),
    // o back ignora/recusa para implantador; só enviamos quando é head
    implementerId: role === 'head' && implementerId ? implementerId : undefined,
  }
}
