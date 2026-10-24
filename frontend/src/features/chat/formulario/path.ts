/** Acesso imutável por caminho ("processo.taxas.0.nome"), igual ao formato das pendências do back. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), obj)
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.')
  const clone: unknown = Array.isArray(obj) ? [...obj] : { ...(obj as object) }
  const c = clone as Record<string, unknown>
  c[head] = rest.length ? setPath(c[head], rest.join('.'), value) : value
  return clone as T
}

export const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
