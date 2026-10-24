import { http, HttpResponse, delay } from 'msw'
import type { Client, MetricKey, Message, Process } from '@/types/schemas'
import { API_URL } from '@/lib/api/client'
import {
  FLOW_BASELINE_MINUTES,
  KNOWN_PHONE,
  NOW,
  PASSWORD,
  catalogMunicipalities,
  clients,
  conversationMessages,
  conversations,
  meetingsBaseline,
  processes,
  secretariatNames,
  users,
} from './fixtures'

const url = (p: string) => `${API_URL}${p}`
const err = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

/* ------------------------------ Auth ------------------------------ */

const tokenFor = (id: string) => `mock.${id}`
const userFrom = (req: Request) => {
  const id = req.headers.get('authorization')?.replace('Bearer mock.', '')
  return users.find((u) => u.id === id)
}

type Handler = Parameters<typeof http.get>[1]
/** Envolve um handler exigindo JWT; passa o usuário e aplica escopo por papel. */
const authed =
  (fn: (ctx: { user: (typeof users)[number]; req: Request; params: Record<string, string> }) => unknown, headOnly = false): Handler =>
  async ({ request, params }) => {
    await delay(250)
    const user = userFrom(request)
    if (!user) return err(401, 'UNAUTHORIZED', 'Sessão expirada. Entre novamente.')
    if (headOnly && user.role !== 'head') return err(403, 'FORBIDDEN', 'Sem permissão.')
    return fn({ user, req: request, params: params as Record<string, string> }) as Response
  }

const visibleClients = (user: (typeof users)[number], implementerId?: string | null): Client[] =>
  clients.filter((c) => (user.role === 'implementer' ? c.implementerId === user.id : !implementerId || c.implementerId === implementerId))

const paginate = <T,>(all: T[], q: URLSearchParams) => {
  const page = Number(q.get('page') ?? 1)
  const pageSize = Number(q.get('pageSize') ?? 20)
  return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length }
}

/* ----------------------------- Métricas ----------------------------- */

const isDone = (p: Process) => ['confirmed', 'sent_to_dev', 'validated'].includes(p.status)

function summarize(list: Client[], from: string, to: string) {
  const ps = processes.filter((p) => list.some((c) => c.id === p.clientId))
  const meetings = list.reduce((s, c) => s + c.meetingsCount, 0)
  const baseline = list.reduce((s, c) => s + meetingsBaseline(c), 0)
  const avgFlow = list.length ? Math.round(list.reduce((s, c) => s + c.flowCreationMinutes, 0) / list.length) : 0
  const started = ps.filter((p) => p.backAndForths > 0)
  return {
    period: { from, to },
    meetings: { value: meetings, baseline, deltaPct: baseline ? Math.round(((meetings - baseline) / baseline) * 100) : 0 },
    hoursSaved: { valueMinutes: list.reduce((s, c) => s + c.hoursSavedMinutes, 0) },
    flowCreation: {
      avgMinutes: avgFlow,
      baselineMinutes: FLOW_BASELINE_MINUTES,
      deltaPct: Math.round(((avgFlow - FLOW_BASELINE_MINUTES) / FLOW_BASELINE_MINUTES) * 100),
    },
    processes: { total: ps.length, complete: ps.filter(isDone).length, validated: ps.filter((p) => p.status === 'validated').length },
    backAndForthsAvg: started.length ? Math.round((started.reduce((s, p) => s + p.backAndForths, 0) / started.length) * 10) / 10 : 0,
  }
}

function series(metric: MetricKey, total: number, days: number, step: number, cumulative: boolean) {
  const points: { date: string; value: number }[] = []
  const n = Math.ceil(days / step)
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n
    const d = new Date(NOW - (n - 1 - i) * step * 86_400_000).toISOString().slice(0, 10)
    const wobble = 1 + Math.sin(i * 1.7) * 0.15
    let value: number
    if (metric === 'flowCreation') value = Math.round(total * (1.9 - t * 0.9) * wobble)
    else if (cumulative) value = Math.round(total * t ** 1.2)
    else value = Math.max(0, Math.round((total / n) * (1.7 - t) * wobble))
    points.push({ date: d, value })
  }
  return points
}

/* ----------------------------- Chat mock ----------------------------- */

interface Session { id: string; token: string; municipalityId: string; municipality: string; secretariatId: string; secretariat: string; name?: string; messages: Message[]; userTurns: number }
const SESSIONS_KEY = 'mock.chatSessions'
const loadSessions = (): Record<string, Session> => {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '{}') } catch { return {} }
}
const saveSessions = (s: Record<string, Session>) => { try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(s)) } catch { /* ignora */ } }

const uploaded = new Map<string, Message['attachments'][number]>()
const uid = () => Math.random().toString(36).slice(2, 10)
const msg = (role: Message['role'], text: string, extra: Partial<Message> = {}): Message => ({
  id: uid(), role, kind: 'text', text, createdAt: new Date().toISOString(), attachments: [], ...extra,
})

const agentScript = [
  'Entendi. Quais **documentos** o requerente precisa apresentar?',
  'Anotado. Existe alguma **taxa**? Se sim, como é calculada e em que etapa é cobrada?',
  'Certo. Agora me conte o **fluxo**: quais setores analisam e em quantos dias, aproximadamente?',
  'Obrigado! Já tenho o suficiente para montar o formulário deste processo. Posso seguir para o próximo?',
]

function newSession(p: { municipalityId: string; municipality: string; secretariatId: string; secretariat: string; name?: string }): Session {
  const id = `s-${uid()}`
  return {
    id, token: `st-${uid()}${uid()}`, ...p, userTurns: 0,
    messages: [msg('agent', `Olá${p.name ? `, ${p.name.split(' ')[0]}` : ''}! Sou o assistente de implantação da Aprova. Vamos mapear as regras dos processos da **${p.secretariat}**. Qual processo você quer configurar primeiro?`)],
  }
}

const sessionFrom = (req: Request, id: string) => {
  const s = loadSessions()[id]
  return s && req.headers.get('x-session-token') === s.token ? s : undefined
}
const contactOf = (s: Session) => ({ name: s.name, municipality: { id: s.municipalityId, name: s.municipality }, secretariat: { id: s.secretariatId, name: s.secretariat } })

/* ----------------------------- Handlers ----------------------------- */

export const handlers = [
  http.post(url('/auth/login'), async ({ request }) => {
    await delay(500)
    const { username, password } = (await request.json()) as { username: string; password: string }
    const u = users.find((x) => x.username === username.trim().toLowerCase())
    if (!u || password !== PASSWORD) return err(401, 'INVALID_CREDENTIALS', 'Usuário ou senha inválidos')
    const { password: _pw, ...user } = u
    return HttpResponse.json({ token: tokenFor(u.id), expiresAt: new Date(NOW + 8 * 3_600_000).toISOString(), user })
  }),
  http.get(url('/auth/me'), authed(({ user }) => {
    const { password: _pw, ...u } = user
    return HttpResponse.json(u)
  })),
  http.post(url('/auth/logout'), () => new HttpResponse(null, { status: 204 })),

  http.get(url('/metrics/summary'), authed(({ user, req }) => {
    const q = new URL(req.url).searchParams
    let list = visibleClients(user, q.get('implementerId'))
    if (q.get('clientId')) list = list.filter((c) => c.id === q.get('clientId'))
    return HttpResponse.json(summarize(list, q.get('from') ?? '', q.get('to') ?? ''))
  })),
  http.get(url('/metrics/timeseries'), authed(({ user, req }) => {
    const q = new URL(req.url).searchParams
    let list = visibleClients(user, q.get('implementerId'))
    if (q.get('clientId')) list = list.filter((c) => c.id === q.get('clientId'))
    const s = summarize(list, '', '')
    const metric = (q.get('metric') ?? 'meetings') as MetricKey
    const step = q.get('granularity') === 'week' ? 7 : 1
    const days = step === 7 ? 63 : 30
    const spec = {
      meetings: [s.meetings.value, false],
      hoursSaved: [s.hoursSaved.valueMinutes, true],
      flowCreation: [s.flowCreation.avgMinutes, false],
      processesComplete: [s.processes.complete, true],
    } as const
    const [total, cumulative] = spec[metric]
    return HttpResponse.json({ metric, points: series(metric, total, days, step, cumulative) })
  })),

  http.get(url('/clients'), authed(({ user, req }) => {
    const q = new URL(req.url).searchParams
    let list = visibleClients(user, q.get('implementerId'))
    if (q.get('status')) list = list.filter((c) => c.status === q.get('status'))
    if (q.get('q')) list = list.filter((c) => c.name.toLowerCase().includes(q.get('q')!.toLowerCase()))
    return HttpResponse.json(paginate(list, q))
  })),
  http.get(url('/clients/:id'), authed(({ user, params }) => {
    const c = visibleClients(user).find((x) => x.id === params.id)
    if (!c) return err(404, 'NOT_FOUND', 'Cliente não encontrado')
    const secretariats = secretariatNames.map((name, i) => {
      const sp = processes.filter((p) => p.clientId === c.id && p.secretariat === name)
      return { id: `sec${i + 1}`, name, processesTotal: sp.length, processesComplete: sp.filter(isDone).length }
    }).filter((s) => s.processesTotal > 0)
    return HttpResponse.json({ ...c, secretariats })
  })),
  http.get(url('/clients/:id/processes'), authed(({ user, req, params }) => {
    if (!visibleClients(user).some((c) => c.id === params.id)) return err(404, 'NOT_FOUND', 'Cliente não encontrado')
    const q = new URL(req.url).searchParams
    let list = processes.filter((p) => p.clientId === params.id)
    if (q.get('secretariat')) list = list.filter((p) => p.secretariat === q.get('secretariat'))
    if (q.get('status')) list = list.filter((p) => p.status === q.get('status'))
    if (q.get('q')) list = list.filter((p) => p.name.toLowerCase().includes(q.get('q')!.toLowerCase()))
    return HttpResponse.json(paginate(list, q))
  })),
  http.get(url('/clients/:id/conversations'), authed(({ user, req, params }) => {
    if (!visibleClients(user).some((c) => c.id === params.id)) return err(404, 'NOT_FOUND', 'Cliente não encontrado')
    return HttpResponse.json(paginate(conversations.filter((c) => c.clientId === params.id), new URL(req.url).searchParams))
  })),
  http.get(url('/conversations/:id'), authed(({ user, params }) => {
    const c = conversations.find((x) => x.id === params.id)
    if (!c || !visibleClients(user).some((x) => x.id === c.clientId)) return err(404, 'NOT_FOUND', 'Conversa não encontrada')
    return HttpResponse.json({ ...c, messages: conversationMessages[c.id] })
  })),
  http.get(url('/processes/:id'), authed(({ user, params }) => {
    const p = processes.find((x) => x.id === params.id)
    if (!p || !visibleClients(user).some((c) => c.id === p.clientId)) return err(404, 'NOT_FOUND', 'Processo não encontrado')
    const fields = [
      { key: 'documentos', label: 'Documentos exigidos', value: 'Documento pessoal; comprovante de endereço', status: 'filled' as const },
      { key: 'taxa', label: 'Taxa', value: p.completeness > 60 ? 'R$ 120,00 na etapa de pagamento' : '', status: p.completeness > 60 ? ('to_validate' as const) : ('pending' as const) },
      { key: 'prazo', label: 'Prazo total', value: p.completeness === 100 ? '30 dias' : '', status: p.completeness === 100 ? ('filled' as const) : ('pending' as const) },
    ]
    return HttpResponse.json({ ...p, fields })
  })),
  http.get(url('/clients/:id/meetings'), authed(() => HttpResponse.json([]))),
  http.post(url('/clients/:id/meetings'), authed(async ({ req, params }) => {
    const b = (await req.json()) as { date: string; durationMinutes: number; notes?: string }
    return HttpResponse.json({ id: uid(), clientId: params.id, notes: '', ...b }, { status: 201 })
  })),

  http.get(url('/implementers'), authed(() => {
    return HttpResponse.json(users.filter((u) => u.role === 'implementer').map((u) => implementerRow(u.id)))
  }, true)),
  http.get(url('/implementers/:id'), authed(({ params }) => {
    if (!users.some((u) => u.id === params.id && u.role === 'implementer')) return err(404, 'NOT_FOUND', 'Implantador não encontrado')
    return HttpResponse.json({ ...implementerRow(params.id), clients: clients.filter((c) => c.implementerId === params.id) })
  }, true)),

  /* ---------- Chat público ---------- */
  http.get(url('/catalog/municipalities'), async ({ request }) => {
    const q = new URL(request.url).searchParams.get('q')?.toLowerCase()
    return HttpResponse.json(catalogMunicipalities.filter((m) => !q || m.name.toLowerCase().includes(q)))
  }),
  http.get(url('/catalog/municipalities/:id/secretariats'), () =>
    HttpResponse.json(secretariatNames.map((name, i) => ({ id: `sec${i + 1}`, name }))),
  ),
  http.post(url('/chat/identify'), async ({ request }) => {
    await delay(400)
    const { phone } = (await request.json()) as { phone: string }
    if (phone === KNOWN_PHONE) {
      const s = newSession({ municipalityId: 'm-c1', municipality: 'Prefeitura de Canoas', secretariatId: 'sec1', secretariat: 'Secretaria de Obras', name: 'João Pereira' })
      saveSessions({ ...loadSessions(), [s.id]: s })
      return HttpResponse.json({ known: true, sessionId: s.id, sessionToken: s.token, contact: contactOf(s) })
    }
    return HttpResponse.json({ known: false, registrationToken: `reg-${uid()}` })
  }),
  http.post(url('/chat/register'), async ({ request }) => {
    await delay(400)
    const b = (await request.json()) as { name?: string; municipality: { id?: string; name?: string }; secretariat: { id?: string; name?: string } }
    const mun = catalogMunicipalities.find((m) => m.id === b.municipality.id)
    const sec = b.secretariat.id ? secretariatNames[Number(b.secretariat.id.replace('sec', '')) - 1] : undefined
    const s = newSession({
      municipalityId: mun?.id ?? 'm-new', municipality: mun?.name ?? b.municipality.name ?? 'Prefeitura',
      secretariatId: b.secretariat.id ?? 'sec-new', secretariat: sec ?? b.secretariat.name ?? 'Secretaria', name: b.name,
    })
    saveSessions({ ...loadSessions(), [s.id]: s })
    return HttpResponse.json({ sessionId: s.id, sessionToken: s.token, contact: contactOf(s) }, { status: 201 })
  }),
  http.get(url('/chat/sessions/:id/messages'), ({ request, params }) => {
    const s = sessionFrom(request, params.id as string)
    return s ? HttpResponse.json(s.messages) : err(401, 'INVALID_SESSION', 'Sessão inválida')
  }),
  http.post(url('/chat/sessions/:id/messages'), async ({ request, params }) => {
    const s = sessionFrom(request, params.id as string)
    if (!s) return err(401, 'INVALID_SESSION', 'Sessão inválida')
    const b = (await request.json()) as { text: string; attachmentIds?: string[] }
    await delay(900)
    const userMessage = msg('user', b.text, { attachments: (b.attachmentIds ?? []).flatMap((id) => uploaded.get(id) ?? []) })
    const agentMessage = msg('agent', agentScript[Math.min(s.userTurns, agentScript.length - 1)])
    s.userTurns++
    s.messages.push(userMessage, agentMessage)
    saveSessions({ ...loadSessions(), [s.id]: s })
    return HttpResponse.json({ userMessage, agentMessage })
  }),
  http.post(url('/chat/sessions/:id/attachments'), async ({ request, params }) => {
    if (!sessionFrom(request, params.id as string)) return err(401, 'INVALID_SESSION', 'Sessão inválida')
    const file = (await request.formData()).get('file') as File
    if (file.size > 10 * 1024 * 1024) return err(413, 'FILE_TOO_LARGE', 'Arquivo maior que 10 MB')
    const id = `a-${uid()}`
    const att = { id, name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, url: `/files/${id}` }
    uploaded.set(id, att)
    return HttpResponse.json(att, { status: 201 })
  }),
]

function implementerRow(id: string) {
  const u = users.find((x) => x.id === id)!
  const cs = clients.filter((c) => c.implementerId === id)
  return {
    id,
    name: u.name,
    clientsCount: cs.length,
    processesTotal: cs.reduce((s, c) => s + c.processesTotal, 0),
    processesComplete: cs.reduce((s, c) => s + c.processesComplete, 0),
    meetingsCount: cs.reduce((s, c) => s + c.meetingsCount, 0),
    hoursSavedMinutes: cs.reduce((s, c) => s + c.hoursSavedMinutes, 0),
    flowCreationAvgMinutes: Math.round(cs.reduce((s, c) => s + c.flowCreationMinutes, 0) / cs.length),
    clientsAtRisk: cs.filter((c) => c.status === 'at_risk').length,
  }
}
