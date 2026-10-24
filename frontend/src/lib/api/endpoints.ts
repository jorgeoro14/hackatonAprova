import { z } from 'zod'
import {
  attachmentSchema,
  catalogMunicipalitySchema,
  catalogSecretariatSchema,
  clientDetailSchema,
  clientSchema,
  conversationDetailSchema,
  conversationSchema,
  identifyResponseSchema,
  implementerDetailSchema,
  implementerSchema,
  loginResponseSchema,
  meetingSchema,
  messageSchema,
  metricsSummarySchema,
  paginated,
  processDetailSchema,
  processSchema,
  sendMessageResponseSchema,
  sessionResponseSchema,
  timeseriesSchema,
  userSchema,
  type MetricKey,
} from '@/types/schemas'
import { request } from './client'

/** Filtros comuns de métricas/listas. Head usa implementerId para drill-down. */
export interface Scope {
  from?: string
  to?: string
  implementerId?: string
  clientId?: string
}

export const authApi = {
  login: (body: { username: string; password: string }) =>
    request('/auth/login', loginResponseSchema, { method: 'POST', body }),
  me: () => request('/auth/me', userSchema),
  logout: () => request('/auth/logout', z.void(), { method: 'POST' }),
}

export const catalogApi = {
  municipalities: (q?: string) =>
    request('/catalog/municipalities', z.array(catalogMunicipalitySchema), { query: { q } }),
  secretariats: (municipalityId: string) =>
    request(`/catalog/municipalities/${municipalityId}/secretariats`, z.array(catalogSecretariatSchema)),
}

export const chatApi = {
  identify: (phone: string) =>
    request('/chat/identify', identifyResponseSchema, { method: 'POST', body: { phone } }),
  register: (body: {
    registrationToken: string
    phone: string
    name?: string
    municipality: { id?: string; name?: string }
    secretariat: { id?: string; name?: string }
  }) => request('/chat/register', sessionResponseSchema, { method: 'POST', body }),
  messages: (sessionId: string, sessionToken: string, after?: string) =>
    request(`/chat/sessions/${sessionId}/messages`, z.array(messageSchema), { sessionToken, query: { after } }),
  sendMessage: (
    sessionId: string,
    sessionToken: string,
    body: { text: string; attachmentIds?: string[]; quickReplyId?: string | null },
  ) =>
    request(`/chat/sessions/${sessionId}/messages`, sendMessageResponseSchema, {
      method: 'POST',
      sessionToken,
      body,
    }),
  uploadAttachment: (sessionId: string, sessionToken: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request(`/chat/sessions/${sessionId}/attachments`, attachmentSchema, {
      method: 'POST',
      sessionToken,
      formData,
    })
  },
}

/** Limites de anexo (devem espelhar o back). */
export const ATTACHMENT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPerMessage: 5,
  accept: '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx,.txt',
}

export const metricsApi = {
  summary: (scope: Scope) => request('/metrics/summary', metricsSummarySchema, { query: { ...scope } }),
  timeseries: (metric: MetricKey, scope: Scope & { granularity?: 'day' | 'week' }) =>
    request('/metrics/timeseries', timeseriesSchema, { query: { metric, ...scope } }),
}

interface ListParams {
  page?: number
  pageSize?: number
  q?: string
}

export const clientsApi = {
  list: (p: ListParams & { implementerId?: string; status?: string } = {}) =>
    request('/clients', paginated(clientSchema), { query: { ...p } }),
  get: (id: string) => request(`/clients/${id}`, clientDetailSchema),
  processes: (id: string, p: ListParams & { secretariat?: string; status?: string } = {}) =>
    request(`/clients/${id}/processes`, paginated(processSchema), { query: { ...p } }),
  conversations: (id: string, p: ListParams = {}) =>
    request(`/clients/${id}/conversations`, paginated(conversationSchema), { query: { ...p } }),
  meetings: (id: string) => request(`/clients/${id}/meetings`, z.array(meetingSchema)),
  addMeeting: (id: string, body: { date: string; durationMinutes: number; notes?: string }) =>
    request(`/clients/${id}/meetings`, meetingSchema, { method: 'POST', body }),
}

export const processesApi = { get: (id: string) => request(`/processes/${id}`, processDetailSchema) }
export const conversationsApi = { get: (id: string) => request(`/conversations/${id}`, conversationDetailSchema) }

export const implementersApi = {
  list: () => request('/implementers', z.array(implementerSchema)),
  get: (id: string) => request(`/implementers/${id}`, implementerDetailSchema),
}
