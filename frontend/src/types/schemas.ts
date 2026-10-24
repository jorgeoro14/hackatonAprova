/**
 * Schemas zod = contrato com o back (docs/BACKEND_CONTRACT.md).
 * Tipos TypeScript são inferidos daqui — fonte única da verdade.
 */
import { z } from 'zod'

export const roleSchema = z.enum(['implementer', 'head'])
export type Role = z.infer<typeof roleSchema>

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  role: roleSchema,
})
export type User = z.infer<typeof userSchema>

export const loginResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  user: userSchema,
})
export type LoginResponse = z.infer<typeof loginResponseSchema>

/* ----------------------------- Chat ----------------------------- */

const refSchema = z.object({ id: z.string(), name: z.string() })

export const contactSchema = z.object({
  name: z.string().optional(),
  municipality: refSchema,
  secretariat: refSchema,
})
export type Contact = z.infer<typeof contactSchema>

export const identifyResponseSchema = z.discriminatedUnion('known', [
  z.object({
    known: z.literal(true),
    sessionId: z.string(),
    sessionToken: z.string(),
    contact: contactSchema,
  }),
  z.object({ known: z.literal(false), registrationToken: z.string() }),
])
export type IdentifyResponse = z.infer<typeof identifyResponseSchema>

export const sessionResponseSchema = z.object({
  sessionId: z.string(),
  sessionToken: z.string(),
  contact: contactSchema,
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>

export const catalogMunicipalitySchema = z.object({ id: z.string(), name: z.string(), uf: z.string() })
export const catalogSecretariatSchema = refSchema

export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  url: z.string(),
})
export type Attachment = z.infer<typeof attachmentSchema>

/*
 * O formulário de implantação (FormularioImplantacao) tem modelo próprio e complexo,
 * definido no back (docs/modelo-formulario-implantacao.md). Será tipado na task T8;
 * até lá a mensagem do chat só carrega a referência.
 */

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'agent', 'system']),
  kind: z.enum(['text', 'quick_replies', 'form']).default('text'),
  text: z.string(),
  createdAt: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  quickReplies: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  /** kind='form': o agente terminou de preencher; id do FormularioImplantacao. */
  formularioId: z.string().optional(),
})
export type Message = z.infer<typeof messageSchema>

export const sendMessageResponseSchema = z.object({
  userMessage: messageSchema,
  agentMessage: messageSchema,
})

/* --------------------------- Dashboard --------------------------- */

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), page: z.number(), pageSize: z.number(), total: z.number() })
export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number }

export const clientStatusSchema = z.enum(['onboarding', 'in_progress', 'completed', 'at_risk'])
export type ClientStatus = z.infer<typeof clientStatusSchema>

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  uf: z.string(),
  implementerId: z.string(),
  implementerName: z.string(),
  status: clientStatusSchema,
  startedAt: z.string(),
  targetDate: z.string(),
  processesTotal: z.number(),
  processesComplete: z.number(),
  secretariatsTotal: z.number(),
  secretariatsDone: z.number(),
  meetingsCount: z.number(),
  hoursSavedMinutes: z.number(),
  flowCreationMinutes: z.number(),
})
export type Client = z.infer<typeof clientSchema>

export const clientDetailSchema = clientSchema.extend({
  secretariats: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      processesTotal: z.number(),
      processesComplete: z.number(),
    }),
  ),
})
export type ClientDetail = z.infer<typeof clientDetailSchema>

export const processStatusSchema = z.enum([
  'not_started',
  'collecting',
  'awaiting_confirmation',
  'confirmed',
  'sent_to_dev',
  'validated',
])
export type ProcessStatus = z.infer<typeof processStatusSchema>

export const processSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  secretariat: z.string(),
  status: processStatusSchema,
  completeness: z.number(),
  backAndForths: z.number(),
  updatedAt: z.string(),
})
export type Process = z.infer<typeof processSchema>

export const processDetailSchema = processSchema.extend({
  fields: z.array(
    z.object({
      key: z.string(),
      /** Agrupamento na tela (ex.: "Documentos e taxas"). */
      section: z.string().default('Geral'),
      label: z.string(),
      value: z.string(),
      status: z.enum(['filled', 'pending', 'to_validate']),
      /** Conversa de onde a informação veio (para o implantador auditar). */
      sourceConversationId: z.string().optional(),
      sourceMessageId: z.string().optional(),
      sourceAttachmentId: z.string().optional(),
    }),
  ),
})
export type ProcessDetail = z.infer<typeof processDetailSchema>

export const conversationSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  secretariat: z.string(),
  startedAt: z.string(),
  lastMessageAt: z.string(),
  messagesCount: z.number(),
  processesTouched: z.array(z.string()),
  status: z.enum(['active', 'waiting_confirmation', 'closed']),
})
export type Conversation = z.infer<typeof conversationSchema>

export const conversationDetailSchema = conversationSchema.extend({ messages: z.array(messageSchema) })
export type ConversationDetail = z.infer<typeof conversationDetailSchema>

export const meetingSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  date: z.string(),
  durationMinutes: z.number(),
  notes: z.string().default(''),
})
export type Meeting = z.infer<typeof meetingSchema>

const deltaMetric = z.object({ value: z.number(), baseline: z.number(), deltaPct: z.number() })

export const metricsSummarySchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  /** Sucesso = diminui. */
  meetings: deltaMetric,
  hoursSaved: z.object({ valueMinutes: z.number() }),
  /** Sucesso = diminui. */
  flowCreation: z.object({ avgMinutes: z.number(), baselineMinutes: z.number(), deltaPct: z.number() }),
  processes: z.object({ total: z.number(), complete: z.number(), validated: z.number() }),
  backAndForthsAvg: z.number(),
})
export type MetricsSummary = z.infer<typeof metricsSummarySchema>

export const metricKeySchema = z.enum(['meetings', 'hoursSaved', 'flowCreation', 'processesComplete'])
export type MetricKey = z.infer<typeof metricKeySchema>

export const timeseriesSchema = z.object({
  metric: metricKeySchema,
  points: z.array(z.object({ date: z.string(), value: z.number() })),
})
export type Timeseries = z.infer<typeof timeseriesSchema>

export const implementerSchema = z.object({
  id: z.string(),
  name: z.string(),
  clientsCount: z.number(),
  processesTotal: z.number(),
  processesComplete: z.number(),
  meetingsCount: z.number(),
  hoursSavedMinutes: z.number(),
  flowCreationAvgMinutes: z.number(),
  clientsAtRisk: z.number(),
})
export type Implementer = z.infer<typeof implementerSchema>

export const implementerDetailSchema = implementerSchema.extend({ clients: z.array(clientSchema) })
export type ImplementerDetail = z.infer<typeof implementerDetailSchema>

export const apiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional() }),
})
