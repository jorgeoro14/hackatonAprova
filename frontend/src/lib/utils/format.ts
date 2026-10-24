/** Minutos → "2h 30min" / "45min" / "3d 4h" (dias de 24h). */
export function formatDuration(minutes: number): string {
  const m = Math.round(Math.abs(minutes))
  if (m < 60) return `${m}min`
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const rest = m % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  return rest > 0 ? `${h}h ${rest}min` : `${h}h`
}

/** Minutos → horas com 1 casa ("90 min" → "1,5 h"). */
export function formatHours(minutes: number): string {
  return `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
}

export const formatNumber = (n: number) => n.toLocaleString('pt-BR')

export const formatPercent = (n: number, digits = 0) =>
  `${n.toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`

/** Delta com sinal: -75 → "−75%", 12 → "+12%". */
export const formatDelta = (pct: number) =>
  `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`

/** Datas "YYYY-MM-DD" são tratadas como locais (evita voltar um dia por fuso). */
export const formatDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** "+5551999998888" → "(51) 99999-8888"; devolve o original se não reconhecer. */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return e164
}
