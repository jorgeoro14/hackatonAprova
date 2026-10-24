import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Card, ErrorState, ProgressBar, Skeleton, Tabs } from '@/components/ui'
import { ClientStatusBadge, Deadline } from '@/features/dashboard/labels'
import { MeetingsTab } from '@/features/dashboard/clients/MeetingsTab'
import { ProcessesTab } from '@/features/dashboard/clients/ProcessesTab'
import { ApiError } from '@/lib/api/client'
import { useClient } from '@/lib/api/hooks'
import { formatDate, formatDuration, formatHours, formatNumber } from '@/lib/utils/format'

type Tab = 'resumo' | 'processos' | 'reunioes'
const tabs: { id: Tab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'processos', label: 'Processos' },
  { id: 'reunioes', label: 'Reuniões' },
]

const Stat = ({ label, value }: { label: string; value: string }) => (
  <Card className="p-4">
    <p className="text-xs text-muted">{label}</p>
    <p className="tabular mt-1 font-title text-xl font-semibold">{value}</p>
  </Card>
)

export function ClientDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (tabs.find((t) => t.id === params.get('tab'))?.id ?? 'resumo') as Tab
  const [secretariat, setSecretariat] = useState('')
  const client = useClient(id)
  const c = client.data

  const setTab = (t: Tab) => setParams(t === 'resumo' ? {} : { tab: t }, { replace: true })

  if (client.isError) {
    const notFound = client.error instanceof ApiError && client.error.status === 404
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState message={notFound ? 'Cliente não encontrado.' : undefined} onRetry={notFound ? undefined : () => client.refetch()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      {!c ? (
        <Skeleton className="h-24" />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{c.name}</h1>
              <p className="mt-1 text-sm text-muted">
                Implantador: {c.implementerName} · início {formatDate(c.startedAt)} · meta {formatDate(c.targetDate)} (<Deadline iso={c.targetDate} />)
              </p>
            </div>
            <ClientStatusBadge status={c.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Processos completos" value={`${formatNumber(c.processesComplete)}/${formatNumber(c.processesTotal)}`} />
            <Stat label="Reuniões" value={formatNumber(c.meetingsCount)} />
            <Stat label="Tempo economizado" value={formatHours(c.hoursSavedMinutes)} />
            <Stat label="Criação do fluxo" value={formatDuration(c.flowCreationMinutes)} />
          </div>

          <Tabs tabs={tabs} value={tab} onChange={setTab} />

          {tab === 'resumo' && (
            <div className="grid gap-3 md:grid-cols-2">
              {c.secretariats.map((s) => {
                const pct = s.processesTotal ? (s.processesComplete / s.processesTotal) * 100 : 0
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSecretariat(s.name); setTab('processos') }}
                    className="rounded-xl border border-line bg-surface p-4 text-left transition hover:border-cyan"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{s.name}</p>
                      <span className="tabular text-sm text-muted">{s.processesComplete}/{s.processesTotal}</span>
                    </div>
                    <ProgressBar value={pct} label={`Progresso de ${s.name}`} className="mt-3" />
                  </button>
                )
              })}
            </div>
          )}
          {tab === 'processos' && (
            <ProcessesTab clientId={c.id} secretariats={c.secretariats.map((s) => s.name)} secretariat={secretariat} onSecretariat={setSecretariat} />
          )}
          {tab === 'reunioes' && <MeetingsTab clientId={c.id} />}
        </>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/dashboard/clients" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft size={16} /> Clientes
    </Link>
  )
}
