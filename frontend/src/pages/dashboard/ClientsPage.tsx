import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { EmptyState, ErrorState, Pagination, ProgressBar, Skeleton, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { ClientStatusBadge, Deadline, clientStatusInfo } from '@/features/dashboard/labels'
import { useScope } from '@/features/dashboard/filters'
import { useAuthStore } from '@/lib/api/authStore'
import { useClients } from '@/lib/api/hooks'
import { formatHours, formatNumber } from '@/lib/utils/format'
import { useDebounced } from '@/lib/utils/useDebounced'

const PAGE_SIZE = 10
const control = 'h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-cyan'

export function ClientsPage() {
  const navigate = useNavigate()
  const isHead = useAuthStore((s) => s.user!.role === 'head')
  const { implementerId } = useScope()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const clients = useClients({ q: dq, status, implementerId, page, pageSize: PAGE_SIZE })
  const items = clients.data?.items ?? []

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-muted">{isHead ? 'Todas as prefeituras em implantação' : 'Prefeituras sob sua responsabilidade'}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            aria-label="Buscar prefeitura"
            placeholder="Buscar prefeitura…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className={`${control} w-full pl-9`}
          />
        </div>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={control}>
          <option value="">Todos os status</option>
          {Object.entries(clientStatusInfo).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {clients.isError ? (
        <ErrorState onRetry={() => clients.refetch()} />
      ) : clients.isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Ajuste a busca ou os filtros." />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Prefeitura</TH>
                {isHead && <TH>Implantador</TH>}
                <TH>Status</TH>
                <TH className="min-w-44">Processos</TH>
                <TH className="text-right">Reuniões</TH>
                <TH className="text-right">Economia</TH>
                <TH>Prazo</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((c) => (
                <TR
                  key={c.id}
                  onClick={() => navigate(`/dashboard/clients/${c.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/dashboard/clients/${c.id}`)}
                  tabIndex={0}
                >
                  <TD className="font-medium">{c.name}</TD>
                  {isHead && <TD className="text-muted">{c.implementerName}</TD>}
                  <TD><ClientStatusBadge status={c.status} /></TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      <ProgressBar value={(c.processesComplete / c.processesTotal) * 100} label={`Processos de ${c.name}`} className="w-24" />
                      <span className="tabular text-xs text-muted">{formatNumber(c.processesComplete)}/{formatNumber(c.processesTotal)}</span>
                    </div>
                  </TD>
                  <TD className="tabular text-right">{c.meetingsCount}</TD>
                  <TD className="tabular text-right">{formatHours(c.hoursSavedMinutes)}</TD>
                  <TD className="whitespace-nowrap text-sm"><Deadline iso={c.targetDate} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={clients.data!.total} onChange={setPage} />
        </>
      )}
    </div>
  )
}
