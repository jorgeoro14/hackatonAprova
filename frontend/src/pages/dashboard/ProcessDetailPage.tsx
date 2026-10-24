import { useTitle } from '@/lib/utils/useTitle'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { Badge, Card, ErrorState, ProgressBar, Skeleton, Tabs, type Tone } from '@/components/ui'
import { ProcessStatusBadge } from '@/features/dashboard/labels'
import { ApiError } from '@/lib/api/client'
import { useProcess } from '@/lib/api/hooks'
import { formatDate } from '@/lib/utils/format'
import type { ProcessDetail } from '@/types/schemas'

type FieldStatus = ProcessDetail['fields'][number]['status']
const fieldStatus: Record<FieldStatus, { label: string; tone: Tone }> = {
  filled: { label: 'Preenchido', tone: 'success' },
  to_validate: { label: 'A validar', tone: 'warning' },
  pending: { label: 'Pendente', tone: 'danger' },
}
type Filter = 'all' | FieldStatus

/** Regras de negócio coletadas para um processo, com origem e pendências. */
export function ProcessDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const q = useProcess(id)
  const p = q.data
  useTitle(p?.name ?? 'Processo')
  const back = p ? `/dashboard/clients/${p.clientId}?tab=processos` : '/dashboard/clients'

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return <ErrorState message={notFound ? 'Processo não encontrado.' : undefined} onRetry={notFound ? undefined : () => q.refetch()} />
  }

  const count = (s: FieldStatus) => p?.fields.filter((f) => f.status === s).length ?? 0
  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: `Todos (${p?.fields.length ?? 0})` },
    { id: 'pending', label: `Pendentes (${count('pending')})` },
    { id: 'to_validate', label: `A validar (${count('to_validate')})` },
    { id: 'filled', label: `Preenchidos (${count('filled')})` },
  ]
  const visible = p?.fields.filter((f) => filter === 'all' || f.status === filter) ?? []
  const sections = [...new Set(visible.map((f) => f.section))]

  return (
    <div className="flex flex-col gap-5">
      <Link to={back} onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); navigate(-1) } }} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Processos
      </Link>

      {!p ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{p.name}</h1>
              <p className="mt-1 text-sm text-muted">{p.secretariat} · atualizado em {formatDate(p.updatedAt)} · {p.backAndForths} idas e vindas</p>
            </div>
            <ProcessStatusBadge status={p.status} />
          </div>

          <Card className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="text-xs text-muted">Completude das regras</p>
              <ProgressBar value={p.completeness} label="Completude" className="mt-2" />
            </div>
            <p className="tabular font-title text-2xl font-semibold">{p.completeness}%</p>
          </Card>

          <Tabs tabs={tabs} value={filter} onChange={setFilter} />

          {sections.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhum campo neste filtro.</p>}
          {sections.map((sec) => (
            <section key={sec} aria-label={sec}>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">{sec}</h2>
              <Card className="divide-y divide-line p-0">
                {visible.filter((f) => f.section === sec).map((f) => (
                  <div key={f.key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted">{f.label}</p>
                      <p className={f.value ? 'mt-0.5 text-ink' : 'mt-0.5 italic text-muted'}>{f.value || 'Ainda não informado'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {f.sourceConversationId && (
                        <Link to={`/dashboard/conversations/${f.sourceConversationId}`} className="inline-flex items-center gap-1 text-xs text-petrol hover:underline">
                          <MessageSquare size={14} /> Ver conversa
                        </Link>
                      )}
                      <Badge tone={fieldStatus[f.status].tone}>{fieldStatus[f.status].label}</Badge>
                    </div>
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
