/** Máscara BR enquanto digita: "51999998888" → "(51) 99999-8888". */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Telefone BR com DDD (10 ou 11 dígitos). */
export const isValidPhone = (masked: string) => {
  const n = masked.replace(/\D/g, '').length
  return n === 10 || n === 11
}

/** "(51) 99999-8888" → "+5551999998888" (E.164, formato esperado pelo back). */
export const toE164 = (masked: string) => `+55${masked.replace(/\D/g, '')}`
