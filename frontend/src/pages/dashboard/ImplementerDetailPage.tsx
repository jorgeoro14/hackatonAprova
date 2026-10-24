import { useTitle } from '@/lib/utils/useTitle'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye } from 'lucide-react'
import { Button, Card, ErrorState, ProgressBar, Skeleton, Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { ClientStatusBadge, Deadline } from '@/features/dashboard/labels'
import { useFilters } from '@/features/dashboard/filters'
import { ApiError } from '@/lib/api/client'
import { useImplementer } from '@/lib/api/hooks'
import { formatDuration, formatHours, formatNumber } from '@/lib/utils/format'
import { comAmostra } from '@/features/dashboard/overview/metrics'

const Stat = ({ label, value }: { label: string; value: string }) => (
  <Card className="p-4">
    <p className="text-xs text-muted">{label}</p>
    <p className="tabular mt-1 font-title text-xl font-semibold">{value}</p>
  </Card>
)

/** Drill-down da head em um implantador: números + clientes; "Ver como" reaproveita as outras telas. */
export function ImplementerDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const setImplementerId = useFilters((s) => s.setImplementerId)
  const q = useImplementer(id)
  const i = q.data
  useTitle(i?.name ?? 'Implantador')

  const viewAs = () => {
    setImplementerId(id)
    navigate('/dashboard')
  }

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return <ErrorState message={notFound ? 'Implantador não encontrado.' : undefined} onRetry={notFound ? undefined : () => q.refetch()} />
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/dashboard/team" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Time
      </Link>
      {!i ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{i.name}</h1>
              <p className="mt-1 text-sm text-muted">{i.clientsCount} clientes · {i.clientsAtRisk} em risco</p>
            </div>
            <Button variant="secondary" onClick={viewAs}><Eye size={16} /> Ver o dashboard dele(a)</Button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Processos completos" value={`${formatNumber(i.processesComplete)}/${formatNumber(i.processesTotal)}`} />
            <Stat label="Reuniões" value={formatNumber(i.meetingsCount)} />
            <Stat label="Tempo economizado" value={formatHours(i.hoursSavedMinutes)} />
            <Stat label="Criação do fluxo (média)" value={formatDuration(comAmostra(i.flowCreationAvgMinutes, i.flowCreationSamples))} />
          </div>

          <Table>
            <THead><TR><TH>Prefeitura</TH><TH>Status</TH><TH className="min-w-40">Processos</TH><TH className="text-right">Reuniões</TH><TH>Prazo</TH></TR></THead>
            <TBody>
              {i.clients.map((c) => (
                <TR key={c.id} tabIndex={0} onClick={() => navigate(`/dashboard/clients/${c.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/dashboard/clients/${c.id}`)}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD><ClientStatusBadge status={c.status} /></TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      <ProgressBar value={(c.processesComplete / c.processesTotal) * 100} label={`Processos de ${c.name}`} className="w-24" />
                      <span className="tabular text-xs text-muted">{c.processesComplete}/{c.processesTotal}</span>
                    </div>
                  </TD>
                  <TD className="tabular text-right">{c.meetingsCount}</TD>
                  <TD className="whitespace-nowrap text-sm"><Deadline iso={c.targetDate} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </div>
  )
}
