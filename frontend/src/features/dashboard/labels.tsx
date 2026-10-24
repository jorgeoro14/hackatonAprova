import { Badge, type Tone } from '@/components/ui'
import type { ClientStatus, ProcessStatus } from '@/types/schemas'

export const clientStatusInfo: Record<ClientStatus, { label: string; tone: Tone }> = {
  onboarding: { label: 'Início', tone: 'neutral' },
  in_progress: { label: 'Em andamento', tone: 'info' },
  completed: { label: 'Concluído', tone: 'success' },
  at_risk: { label: 'Em risco', tone: 'danger' },
}

export const processStatusInfo: Record<ProcessStatus, { label: string; tone: Tone }> = {
  not_started: { label: 'Não iniciado', tone: 'neutral' },
  collecting: { label: 'Coletando', tone: 'info' },
  awaiting_confirmation: { label: 'Aguardando confirmação', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'success' },
  sent_to_dev: { label: 'Com o time de dev', tone: 'info' },
  validated: { label: 'Validado', tone: 'success' },
}

export const ClientStatusBadge = ({ status }: { status: ClientStatus }) => (
  <Badge tone={clientStatusInfo[status].tone}>{clientStatusInfo[status].label}</Badge>
)
export const ProcessStatusBadge = ({ status }: { status: ProcessStatus }) => (
  <Badge tone={processStatusInfo[status].tone}>{processStatusInfo[status].label}</Badge>
)

/** Dias até a meta: positivo = faltam, negativo = atrasado. */
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)

export function Deadline({ iso }: { iso: string }) {
  const d = daysUntil(iso)
  return (
    <span className={d < 0 ? 'text-danger' : d <= 10 ? 'text-warning' : 'text-ink'}>
      {d < 0 ? `${Math.abs(d)} d atrasado` : `${d} d restantes`}
    </span>
  )
}
