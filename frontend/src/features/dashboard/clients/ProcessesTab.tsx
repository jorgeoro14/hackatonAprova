import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { EmptyState, ErrorState, Pagination, ProgressBar, Skeleton, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { ProcessStatusBadge, processStatusInfo } from '@/features/dashboard/labels'
import { useClientProcesses } from '@/lib/api/hooks'
import { formatDate } from '@/lib/utils/format'
import { useDebounced } from '@/lib/utils/useDebounced'

const PAGE_SIZE = 15
const control = 'h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-cyan'

interface Props {
  clientId: string
  secretariats: string[]
  secretariat: string
  onSecretariat: (s: string) => void
}

export function ProcessesTab({ clientId, secretariats, secretariat, onSecretariat }: Props) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const list = useClientProcesses(clientId, { q: dq, status, secretariat, page, pageSize: PAGE_SIZE })
  const items = list.data?.items ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input aria-label="Buscar processo" placeholder="Buscar processo…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} className={`${control} w-full pl-9`} />
        </div>
        <select aria-label="Secretaria" value={secretariat} onChange={(e) => { onSecretariat(e.target.value); setPage(1) }} className={control}>
          <option value="">Todas as secretarias</option>
          {secretariats.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={control}>
          <option value="">Todos os status</option>
          {Object.entries(processStatusInfo).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum processo encontrado" description="Ajuste a busca ou os filtros." />
      ) : (
        <>
          <Table>
            <THead>
              <TR><TH>Processo</TH><TH>Secretaria</TH><TH>Status</TH><TH className="min-w-32">Completude</TH><TH className="text-right">Idas e vindas</TH><TH>Atualizado</TH></TR>
            </THead>
            <TBody>
              {items.map((p) => (
                <TR key={p.id} tabIndex={0} onClick={() => navigate(`/dashboard/processes/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/dashboard/processes/${p.id}`)}>
                  <TD className="font-medium">{p.name}</TD>
                  <TD className="text-muted">{p.secretariat}</TD>
                  <TD><ProcessStatusBadge status={p.status} /></TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={p.completeness} label={`Completude de ${p.name}`} className="w-16" />
                      <span className="tabular text-xs text-muted">{p.completeness}%</span>
                    </div>
                  </TD>
                  <TD className="tabular text-right">{p.backAndForths}</TD>
                  <TD className="text-muted">{formatDate(p.updatedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data!.total} onChange={setPage} />
        </>
      )}
    </div>
  )
}
