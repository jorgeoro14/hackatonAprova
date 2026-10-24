import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader, ErrorState, Skeleton, Tabs } from '@/components/ui'
import { useTimeseries } from '@/lib/api/hooks'
import type { Scope } from '@/lib/api/endpoints'
import type { MetricKey } from '@/types/schemas'
import { METRICS } from './metrics'

const tabs = (Object.keys(METRICS) as MetricKey[]).map((id) => ({ id, label: METRICS[id].label }))
const shortDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function TrendChart({ scope, granularity }: { scope: Scope; granularity: 'day' | 'week' }) {
  const [metric, setMetric] = useState<MetricKey>('meetings')
  const q = useTimeseries(metric, { ...scope, granularity })
  const info = METRICS[metric]
  const data = q.data?.points.map((p) => ({ date: p.date, value: p.value }))

  return (
    <Card>
      <CardHeader title="Evolução" description={`${info.label} por ${granularity === 'week' ? 'semana' : 'dia'}`} />
      <Tabs tabs={tabs} value={metric} onChange={setMetric} />
      <div className="mt-4 h-64" role="img" aria-label={`Gráfico de ${info.label} por ${granularity === 'week' ? 'semana' : 'dia'}`}>
        {q.isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--cyan)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--cyan)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis
                tickFormatter={(v: number) => `${Math.round(info.toAxis(v)).toLocaleString('pt-BR')}${info.axisUnit}`}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={52}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: 'var(--line)' }}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 13 }}
                labelStyle={{ color: 'var(--muted)' }}
                labelFormatter={(l) => shortDate(String(l))}
                formatter={(v) => [info.format(Number(v)), info.label]}
              />
              <Area type="monotone" dataKey="value" stroke="var(--cyan)" strokeWidth={2} fill="url(#trend)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
