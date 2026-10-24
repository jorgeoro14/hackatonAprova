import type { MetricKey } from '@/types/schemas'
import { formatDuration, formatHours, formatNumber } from '@/lib/utils/format'

interface MetricInfo {
  label: string
  /** Converte o valor bruto (minutos/contagem) para o número exibido nos eixos. */
  toAxis: (v: number) => number
  axisUnit: string
  format: (v: number) => string
}

export const METRICS: Record<MetricKey, MetricInfo> = {
  meetings: { label: 'Reuniões', toAxis: (v) => v, axisUnit: '', format: (v) => formatNumber(v) },
  hoursSaved: { label: 'Horas economizadas', toAxis: (v) => v / 60, axisUnit: 'h', format: (v) => formatHours(v) },
  flowCreation: { label: 'Tempo de criação do fluxo', toAxis: (v) => v / 1440, axisUnit: 'd', format: (v) => formatDuration(v) },
  processesComplete: { label: 'Processos com regra completa', toAxis: (v) => v, axisUnit: '', format: (v) => formatNumber(v) },
}
