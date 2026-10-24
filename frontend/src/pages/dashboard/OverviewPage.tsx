import { Card, ErrorState } from '@/components/ui'
import { useScope, useFilters } from '@/features/dashboard/filters'
import { KpiCard } from '@/features/dashboard/overview/KpiCard'
import { Sparkline } from '@/features/dashboard/overview/Sparkline'
import { TrendChart } from '@/features/dashboard/overview/TrendChart'
import { useMetricsSummary, useTimeseries } from '@/lib/api/hooks'
import { useAuthStore } from '@/lib/api/authStore'
import { formatDuration, formatHours, formatNumber, formatPercent } from '@/lib/utils/format'

export function OverviewPage() {
  const user = useAuthStore((s) => s.user)!
  const scope = useScope()
  const period = useFilters((s) => s.period)
  const granularity = period === '90d' ? 'week' : 'day'
  const sum = useMetricsSummary(scope)
  const meetingsSeries = useTimeseries('meetings', { ...scope, granularity })
  const savedSeries = useTimeseries('hoursSaved', { ...scope, granularity })
  const flowSeries = useTimeseries('flowCreation', { ...scope, granularity })
  const s = sum.data
  const loading = sum.isLoading

  const pct = s && s.processes.total ? (s.processes.complete / s.processes.total) * 100 : 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="text-sm text-muted">
          {user.role === 'head' ? 'Todos os implantadores e clientes' : 'Seus clientes'} · resultados da implantação com o agente de IA
        </p>
      </div>

      {sum.isError ? (
        <ErrorState onRetry={() => sum.refetch()} />
      ) : (
        <>
          <section aria-label="Indicadores principais" className="grid gap-4 md:grid-cols-3">
            <KpiCard
              title="Reuniões realizadas"
              loading={loading}
              value={s && formatNumber(s.meetings.value)}
              deltaPct={s?.meetings.deltaPct}
              goodWhen="down"
              caption={s && `Processo manual: ${formatNumber(s.meetings.baseline)} reuniões`}
              chart={meetingsSeries.data && <Sparkline id="m" data={meetingsSeries.data.points} />}
            />
            <KpiCard
              title="Tempo economizado do implantador"
              loading={loading}
              value={s && formatHours(s.hoursSaved.valueMinutes)}
              caption={s && `≈ ${(s.hoursSaved.valueMinutes / 60 / 8).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias de trabalho`}
              chart={savedSeries.data && <Sparkline id="h" data={savedSeries.data.points} />}
            />
            <KpiCard
              title="Tempo de criação do fluxo"
              loading={loading}
              value={s && formatDuration(s.flowCreation.avgMinutes)}
              deltaPct={s?.flowCreation.deltaPct}
              goodWhen="down"
              caption={s && `Média por processo · manual: ${formatDuration(s.flowCreation.baselineMinutes)}`}
              chart={flowSeries.data && <Sparkline id="f" data={flowSeries.data.points} />}
            />
          </section>

          <section aria-label="Andamento" className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <p className="text-sm text-muted">Processos com regra completa</p>
              <p className="tabular mt-1 font-title text-2xl font-semibold">
                {s ? `${formatNumber(s.processes.complete)} de ${formatNumber(s.processes.total)}` : '—'}
                <span className="ml-2 text-base font-normal text-muted">{s && formatPercent(pct)}</span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Processos com regra completa">
                <div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">{s && `${formatNumber(s.processes.validated)} já validados em produção`}</p>
            </Card>
            <Card>
              <p className="text-sm text-muted">Idas e vindas por processo</p>
              <p className="tabular mt-1 font-title text-2xl font-semibold">{s ? s.backAndForthsAvg.toLocaleString('pt-BR') : '—'}</p>
              <p className="mt-2 text-xs text-muted">Média até a regra ficar completa</p>
            </Card>
          </section>

          <TrendChart scope={scope} granularity={granularity} />
        </>
      )}
    </div>
  )
}
