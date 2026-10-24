import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader, Tabs } from '@/components/ui'
import { formatDuration, formatHours, formatNumber, formatPercent } from '@/lib/utils/format'
import type { Implementer } from '@/types/schemas'
import { comAmostra } from '@/features/dashboard/overview/metrics'

type Key = 'hours' | 'meetings' | 'flow' | 'progress'

const metrics: Record<Key, { label: string; hint: string; value: (i: Implementer) => number | null; format: (v: number) => string }> = {
  hours: { label: 'Tempo economizado', hint: 'Quanto maior, melhor', value: (i) => i.hoursSavedMinutes, format: (v) => formatHours(v) },
  meetings: { label: 'Reuniões', hint: 'Quanto menor, melhor', value: (i) => i.meetingsCount, format: (v) => formatNumber(v) },
  flow: { label: 'Criação do fluxo', hint: 'Quanto menor, melhor', value: (i) => comAmostra(i.flowCreationAvgMinutes, i.flowCreationSamples), format: (v) => formatDuration(v) },
  progress: { label: 'Processos completos', hint: 'Quanto maior, melhor', value: (i) => (i.processesTotal ? (i.processesComplete / i.processesTotal) * 100 : 0), format: (v) => formatPercent(v) },
}
const tabs = (Object.keys(metrics) as Key[]).map((id) => ({ id, label: metrics[id].label }))

export function ImplementerChart({ data }: { data: Implementer[] }) {
  const [key, setKey] = useState<Key>('hours')
  const m = metrics[key]
  const rows = data.map((i) => ({ name: i.name.split(' ')[0], value: m.value(i) }))
  return (
    <Card>
      <CardHeader title="Comparativo entre implantadores" description={m.hint} />
      <Tabs tabs={tabs} value={key} onChange={setKey} />
      <div className="mt-4 h-60" role="img" aria-label={`Gráfico comparando ${m.label} entre implantadores`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'var(--soft)' }}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontSize: 13 }}
              formatter={(v) => [v == null ? '—' : m.format(Number(v)), m.label]}
            />
            <Bar dataKey="value" fill="var(--cyan)" radius={[6, 6, 0, 0]} maxBarSize={72}>
              <LabelList dataKey="value" position="top" formatter={(v) => (v == null ? '—' : m.format(Number(v)))} fill="var(--ink)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
