import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MetricKey } from '@/types/schemas'
import {
  authApi,
  clientsApi,
  conversationsApi,
  implementersApi,
  metricsApi,
  processesApi,
  type Scope,
} from './endpoints'
import { useAuthStore } from './authStore'

/** Chaves de cache centralizadas. */
export const qk = {
  summary: (s: Scope) => ['metrics', 'summary', s] as const,
  series: (m: MetricKey, s: Scope & { granularity?: string }) => ['metrics', 'series', m, s] as const,
  clients: (p: object) => ['clients', p] as const,
  client: (id: string) => ['client', id] as const,
  processes: (id: string, p: object) => ['client', id, 'processes', p] as const,
  process: (id: string) => ['process', id] as const,
  conversations: (id: string, p: object) => ['client', id, 'conversations', p] as const,
  conversation: (id: string) => ['conversation', id] as const,
  meetings: (id: string) => ['client', id, 'meetings'] as const,
  implementers: ['implementers'] as const,
  implementer: (id: string) => ['implementer', id] as const,
}

export const useLogin = () => {
  const setAuth = useAuthStore((s) => s.setAuth)
  return useMutation({ mutationFn: authApi.login, onSuccess: setAuth })
}

export const useMetricsSummary = (scope: Scope) =>
  useQuery({ queryKey: qk.summary(scope), queryFn: () => metricsApi.summary(scope), placeholderData: keepPreviousData })

export const useTimeseries = (metric: MetricKey, scope: Scope & { granularity?: 'day' | 'week' }) =>
  useQuery({
    queryKey: qk.series(metric, scope),
    queryFn: () => metricsApi.timeseries(metric, scope),
    placeholderData: keepPreviousData,
  })

export const useClients = (p: Parameters<typeof clientsApi.list>[0] = {}) =>
  useQuery({ queryKey: qk.clients(p), queryFn: () => clientsApi.list(p), placeholderData: keepPreviousData })

export const useClient = (id: string) => useQuery({ queryKey: qk.client(id), queryFn: () => clientsApi.get(id) })

export const useClientProcesses = (id: string, p: Parameters<typeof clientsApi.processes>[1] = {}) =>
  useQuery({ queryKey: qk.processes(id, p), queryFn: () => clientsApi.processes(id, p), placeholderData: keepPreviousData })

export const useProcess = (id: string) => useQuery({ queryKey: qk.process(id), queryFn: () => processesApi.get(id) })

export const useClientConversations = (id: string, p: Parameters<typeof clientsApi.conversations>[1] = {}) =>
  useQuery({ queryKey: qk.conversations(id, p), queryFn: () => clientsApi.conversations(id, p), placeholderData: keepPreviousData })

export const useConversation = (id: string) =>
  useQuery({ queryKey: qk.conversation(id), queryFn: () => conversationsApi.get(id) })

export const useMeetings = (clientId: string) =>
  useQuery({ queryKey: qk.meetings(clientId), queryFn: () => clientsApi.meetings(clientId) })

export const useAddMeeting = (clientId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: Parameters<typeof clientsApi.addMeeting>[1]) => clientsApi.addMeeting(clientId, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.meetings(clientId) })
      qc.invalidateQueries({ queryKey: ['metrics'] })
    },
  })
}

export const useImplementers = () => useQuery({ queryKey: qk.implementers, queryFn: implementersApi.list })

export const useImplementer = (id: string) =>
  useQuery({ queryKey: qk.implementer(id), queryFn: () => implementersApi.get(id) })
