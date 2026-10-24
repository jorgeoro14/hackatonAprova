import { useTitle } from '@/lib/utils/useTitle'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import { Badge, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { ImplementerChart } from '@/features/dashboard/team/ImplementerChart'
import { useClients, useImplementers } from '@/lib/api/hooks'
import { formatDuration, formatHours, formatNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { Implementer } from '@/types/schemas'

type SortKey = 'name' | 'clientsCount' | 'progress' | 'meetingsCount' | 'hoursSavedMinutes' | 'flowCreationAvgMinutes'
const progress = (i: Implementer) => (i.processesTotal ? i.processesComplete / i.processesTotal : 0)
const sortValue = (i: Implementer, k: SortKey) => (k === 'progress' ? progress(i) : k === 'name' ? i.name : i[k])

function SortTH({ label, k, sort, onSort, right }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; right?: boolean }) {
  const active = sort.key === k
  return (
    <TH className={cn(right && 'text-right')} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink', active && 'text-ink')}>
        {label}
        {active && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </TH>
  )
}

/** Visão da head: comparativo de implantadores e clientes em risco. */
export function TeamPage() {
  useTitle('Time')
  const navigate = useNavigate()
  const team = useImplementers()
  const atRisk = useClients({ status: 'at_risk', pageSize: 20 })
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'hoursSavedMinutes', dir: -1 })

  const rows = useMemo(
    () => [...(team.data ?? [])].sort((a, b) => {
      const x = sortValue(a, sort.key)
      const y = sortValue(b, sort.key)
      // sem dado (null) vai sempre para o fim
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
      return (typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y)) * sort.dir
    }),
    [team.data, sort],
  )
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (-s.dir) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }))
  const open = (id: string) => navigate(`/dashboard/team/${id}`)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Time de implantação</h1>
        <p className="text-sm text-muted">Performance de cada implantador e dos clientes sob sua responsabilidade</p>
      </div>

      {team.isError ? (
        <ErrorState onRetry={() => team.refetch()} />
      ) : team.isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum implantador cadastrado" />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <SortTH label="Implantador" k="name" sort={sort} onSort={onSort} />
                <SortTH label="Clientes" k="clientsCount" sort={sort} onSort={onSort} right />
                <SortTH label="Processos completos" k="progress" sort={sort} onSort={onSort} />
                <SortTH label="Reuniões" k="meetingsCount" sort={sort} onSort={onSort} right />
                <SortTH label="Economia" k="hoursSavedMinutes" sort={sort} onSort={onSort} right />
                <SortTH label="Fluxo (média)" k="flowCreationAvgMinutes" sort={sort} onSort={onSort} right />
                <TH>Risco</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((i) => (
                <TR key={i.id} tabIndex={0} onClick={() => open(i.id)} onKeyDown={(e) => e.key === 'Enter' && open(i.id)}>
                  <TD className="font-medium">{i.name}</TD>
                  <TD className="tabular text-right">{i.clientsCount}</TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      <ProgressBar value={progress(i) * 100} label={`Processos de ${i.name}`} className="w-24" />
                      <span className="tabular text-xs text-muted">{formatNumber(i.processesComplete)}/{formatNumber(i.processesTotal)}</span>
                    </div>
                  </TD>
                  <TD className="tabular text-right">{i.meetingsCount}</TD>
                  <TD className="tabular text-right">{formatHours(i.hoursSavedMinutes)}</TD>
                  <TD className="tabular text-right">{formatDuration(i.flowCreationAvgMinutes)}</TD>
                  <TD>{i.clientsAtRisk > 0 ? <Badge tone="danger">{i.clientsAtRisk} em risco</Badge> : <Badge tone="success">Em dia</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-3"><ImplementerChart data={rows} /></div>
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader title="Clientes em risco" description="Atrasados ou com avanço abaixo do esperado" />
              {atRisk.isLoading ? (
                <Skeleton className="h-20" />
              ) : atRisk.data?.items.length ? (
                <ul className="flex flex-col divide-y divide-line">
                  {atRisk.data.items.map((c) => (
                    <li key={c.id}>
                      <Link to={`/dashboard/clients/${c.id}`} className="flex items-center gap-3 py-3 hover:text-petrol">
                        <AlertTriangle size={16} className="shrink-0 text-danger" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="text-xs text-muted">{c.implementerName} · {c.processesComplete}/{c.processesTotal} processos</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-muted">Nenhum cliente em risco.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
