import type { z } from 'zod'
import { apiErrorBodySchema } from '@/types/schemas'
import { useAuthStore } from './authStore'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

type Query = Record<string, string | number | boolean | undefined | null>

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Query
  body?: unknown
  formData?: FormData
  /** Token do chat público (header X-Session-Token) em vez do JWT. */
  sessionToken?: string | null
  signal?: AbortSignal
}

function buildUrl(path: string, query?: Query) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const s = qs.toString()
  return `${API_URL}${path}${s ? `?${s}` : ''}`
}

/** fetch tipado: valida a resposta com zod e normaliza erros em ApiError. */
export async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  { method = 'GET', query, body, formData, sessionToken, signal }: Options = {},
): Promise<z.infer<S>> {
  const headers: Record<string, string> = {}
  const jwt = useAuthStore.getState().token
  if (sessionToken) headers['X-Session-Token'] = sessionToken
  else if (jwt) headers.Authorization = `Bearer ${jwt}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Sem conexão com o servidor.')
  }

  if (!res.ok) {
    if (res.status === 401 && jwt && !sessionToken) useAuthStore.getState().logout()
    const parsed = apiErrorBodySchema.safeParse(await res.json().catch(() => null))
    throw parsed.success
      ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details)
      : new ApiError(res.status, 'HTTP_ERROR', `Erro ${res.status}`)
  }

  if (res.status === 204) return schema.parse(undefined)
  return schema.parse(await res.json())
}
