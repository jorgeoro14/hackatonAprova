/**
 * Dados de demonstração determinísticos (mesma seed → mesmos dados).
 * Simulam o que o back vai devolver; ver docs/BACKEND_CONTRACT.md.
 */
import type {
  Client,
  ClientStatus,
  Conversation,
  Message,
  Process,
  ProcessStatus,
  User,
} from '@/types/schemas'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86_400_000
export const NOW = new Date('2026-10-24T12:00:00Z').getTime()
const iso = (ms: number) => new Date(ms).toISOString()

/* ------------------------------ Usuários ------------------------------ */

export const PASSWORD = 'demo123'

export const users: (User & { password: string })[] = [
  { id: 'u0', name: 'Helena Prado', username: 'head', role: 'head', password: PASSWORD },
  { id: 'u1', name: 'Maria Silva', username: 'maria.silva', role: 'implementer', password: PASSWORD },
  { id: 'u2', name: 'Carlos Souza', username: 'carlos.souza', role: 'implementer', password: PASSWORD },
  { id: 'u3', name: 'Ana Lima', username: 'ana.lima', role: 'implementer', password: PASSWORD },
]

/* ----------------------- Secretarias e processos ----------------------- */

export const secretariatProcesses: Record<string, string[]> = {
  'Secretaria de Obras': ['Alvará de construção', 'Alvará de reforma', 'Alvará de demolição', 'Habite-se', 'Certidão de número', 'Certidão de alinhamento', 'Regularização de edificação', 'Averbação de construção'],
  'Meio Ambiente': ['Licença ambiental prévia', 'Licença de instalação', 'Licença de operação', 'Autorização de supressão de vegetação', 'Poda de árvore', 'Certidão ambiental', 'Denúncia ambiental', 'Declaração de dispensa de licenciamento'],
  'Secretaria da Fazenda': ['Certidão negativa de débitos', 'Segunda via de IPTU', 'Parcelamento de dívida ativa', 'Isenção de IPTU', 'Cadastro mobiliário', 'Baixa de inscrição municipal', 'Restituição de tributos', 'Emissão de nota fiscal avulsa'],
  'Secretaria de Saúde': ['Alvará sanitário', 'Licença sanitária', 'Cartão SUS', 'Agendamento de consulta', 'Solicitação de medicamento', 'Vigilância epidemiológica', 'Declaração de vacinação', 'Cadastro de estabelecimento de saúde'],
  'Secretaria de Educação': ['Matrícula escolar', 'Transferência escolar', 'Transporte escolar', 'Vaga em creche', 'Histórico escolar', 'Declaração de escolaridade', 'Merenda especial', 'Reclassificação de aluno'],
  'Planejamento Urbano': ['Consulta prévia de viabilidade', 'Certidão de uso do solo', 'Parcelamento do solo', 'Desmembramento de lote', 'Unificação de lotes', 'Análise de projeto urbanístico', 'Estudo de impacto de vizinhança', 'Alteração de zoneamento'],
  'Administração': ['Solicitação de material', 'Protocolo geral', 'Requisição de servidor', 'Cessão de espaço público', 'Pedido de certidão funcional', 'Abertura de licitação', 'Gestão de contratos', 'Solicitação de diárias'],
  'Assistência Social': ['Cadastro único', 'Benefício eventual', 'Cesta básica', 'Aluguel social', 'Atendimento CRAS', 'Atendimento CREAS', 'Isenção de tarifa social', 'Cadastro de entidade assistencial'],
  'Cultura e Turismo': ['Cessão de teatro', 'Cadastro de artista', 'Evento em espaço público', 'Alvará de evento', 'Fomento cultural', 'Cadastro de guia turístico', 'Uso de biblioteca', 'Tombamento de imóvel'],
  'Trânsito e Mobilidade': ['Autorização de carga e descarga', 'Cartão de estacionamento rotativo', 'Credencial de idoso', 'Credencial de PCD', 'Recurso de multa', 'Solicitação de sinalização', 'Táxi e transporte por aplicativo', 'Interdição de via'],
  'Procuradoria': ['Parecer jurídico', 'Certidão de inteiro teor', 'Desapropriação', 'Acordo judicial', 'Defesa em processo', 'Notificação extrajudicial', 'Ação regressiva', 'Consulta jurídica'],
  'Esportes e Lazer': ['Cessão de ginásio', 'Inscrição em escolinha', 'Evento esportivo', 'Cadastro de atleta', 'Uso de campo', 'Fomento ao esporte', 'Cadastro de entidade esportiva', 'Academia ao ar livre'],
  'Gabinete do Prefeito': ['Audiência com o prefeito', 'Ouvidoria', 'Lei de acesso à informação', 'Ofício ao gabinete', 'Convênio', 'Moção e homenagem', 'Agenda oficial', 'Pedido de apoio institucional'],
}

export const secretariatNames = Object.keys(secretariatProcesses)
const TOTAL_PROCESSES = 100

/* ----------------------------- Clientes ----------------------------- */

interface Seed {
  id: string
  name: string
  uf: string
  implementerId: string
  progress: number
  startedDaysAgo: number
  meetings: number
  status: ClientStatus
}

const clientSeeds: Seed[] = [
  { id: 'c1', name: 'Prefeitura de Canoas', uf: 'RS', implementerId: 'u1', progress: 0.72, startedDaysAgo: 38, meetings: 4, status: 'in_progress' },
  { id: 'c2', name: 'Prefeitura de Gravataí', uf: 'RS', implementerId: 'u1', progress: 0.35, startedDaysAgo: 22, meetings: 3, status: 'in_progress' },
  { id: 'c3', name: 'Prefeitura de Novo Hamburgo', uf: 'RS', implementerId: 'u2', progress: 0.9, startedDaysAgo: 52, meetings: 6, status: 'in_progress' },
  { id: 'c4', name: 'Prefeitura de São Leopoldo', uf: 'RS', implementerId: 'u2', progress: 0.18, startedDaysAgo: 48, meetings: 9, status: 'at_risk' },
  { id: 'c5', name: 'Prefeitura de Esteio', uf: 'RS', implementerId: 'u3', progress: 0.55, startedDaysAgo: 30, meetings: 5, status: 'in_progress' },
]

const implementerName = (id: string) => users.find((u) => u.id === id)!.name

const statusFor = (r: number, p: number): ProcessStatus => {
  // p = fração de avanço; r = posição relativa do processo (0..1)
  if (r < p * 0.6) return r < p * 0.35 ? 'validated' : 'sent_to_dev'
  if (r < p * 0.8) return 'confirmed'
  if (r < p * 0.9) return 'awaiting_confirmation'
  if (r < p + 0.12) return 'collecting'
  return 'not_started'
}

export const processes: Process[] = []
export const clients: Client[] = []

for (const seed of clientSeeds) {
  const rand = rng(seed.id.charCodeAt(1) * 977)
  let idx = 0
  for (const sec of secretariatNames) {
    for (const name of secretariatProcesses[sec]) {
      if (idx >= TOTAL_PROCESSES) break
      const status = statusFor(idx / TOTAL_PROCESSES + (rand() - 0.5) * 0.15, seed.progress)
      const done = ['confirmed', 'sent_to_dev', 'validated'].includes(status)
      processes.push({
        id: `${seed.id}-p${idx + 1}`,
        clientId: seed.id,
        name,
        secretariat: sec,
        status,
        completeness: done ? 100 : status === 'awaiting_confirmation' ? 95 : status === 'collecting' ? Math.round(20 + rand() * 60) : 0,
        backAndForths: status === 'not_started' ? 0 : Math.round(1 + rand() * 3),
        updatedAt: iso(NOW - Math.round(rand() * seed.startedDaysAgo) * DAY),
      })
      idx++
    }
  }
}

const isDone = (p: Process) => ['confirmed', 'sent_to_dev', 'validated'].includes(p.status)

for (const seed of clientSeeds) {
  const ps = processes.filter((p) => p.clientId === seed.id)
  const complete = ps.filter(isDone).length
  const secs = secretariatNames.map((s) => {
    const sp = ps.filter((p) => p.secretariat === s)
    return { total: sp.length, done: sp.filter(isDone).length }
  })
  clients.push({
    id: seed.id,
    name: seed.name,
    uf: seed.uf,
    implementerId: seed.implementerId,
    implementerName: implementerName(seed.implementerId),
    status: seed.status,
    startedAt: iso(NOW - seed.startedDaysAgo * DAY),
    targetDate: iso(NOW + (60 - seed.startedDaysAgo) * DAY),
    processesTotal: ps.length,
    processesComplete: complete,
    secretariatsTotal: secs.filter((s) => s.total > 0).length,
    secretariatsDone: secs.filter((s) => s.total > 0 && s.done === s.total).length,
    meetingsCount: seed.meetings,
    hoursSavedMinutes: complete * 42 + ps.filter((p) => p.status === 'collecting').length * 12,
    // como no back: 0 com 0 amostras enquanto nenhum processo foi validado
    flowCreationSamples: ps.filter((p) => p.status === 'validated').length,
    flowCreationMinutes: ps.some((p) => p.status === 'validated') ? Math.round(1800 + (1 - seed.progress) * 2400) : 0,
  })
}

/** Sem IA, cada processo exigiria ~1 reunião de 1h a cada 2,5 processos. */
export const meetingsBaseline = (c: Client) => Math.max(Math.round(c.processesComplete / 2.5), c.meetingsCount * 2)
export const FLOW_BASELINE_MINUTES = 14_400 // 10 dias corridos de ida e volta

/* ----------------------------- Conversas ----------------------------- */

const contactNames = ['João Pereira', 'Fernanda Dias', 'Ricardo Alves', 'Patrícia Gomes', 'Marcos Teixeira', 'Luciana Rocha']

export const conversations: Conversation[] = []
export const conversationMessages: Record<string, Message[]> = {}

clients.forEach((c, ci) => {
  secretariatNames.slice(0, 4).forEach((sec, si) => {
    const id = `conv-${c.id}-${si + 1}`
    const proc = processes.filter((p) => p.clientId === c.id && p.secretariat === sec).slice(0, 2).map((p) => p.name)
    const start = NOW - (3 + si * 4 + ci) * DAY
    const msgs: Message[] = [
      { id: `${id}-m1`, role: 'agent', kind: 'text', text: 'Olá! Sou o assistente de implantação da Aprova. Vamos mapear as regras dos seus processos. Por onde quer começar?', createdAt: iso(start), attachments: [] },
      { id: `${id}-m2`, role: 'user', kind: 'text', text: `Quero configurar o ${proc[0] ?? 'processo'}.`, createdAt: iso(start + 60_000), attachments: [] },
      { id: `${id}-m3`, role: 'agent', kind: 'text', text: 'Perfeito. Quais documentos o requerente precisa apresentar?', createdAt: iso(start + 90_000), attachments: [] },
      { id: `${id}-m4`, role: 'user', kind: 'text', text: 'Documento pessoal, comprovante de endereço e matrícula do imóvel.', createdAt: iso(start + 180_000), attachments: [] },
      { id: `${id}-m5`, role: 'agent', kind: 'text', text: 'Anotado. E existe alguma taxa cobrada? Se sim, em qual etapa?', createdAt: iso(start + 210_000), attachments: [] },
    ]
    conversationMessages[id] = msgs
    conversations.push({
      id,
      clientId: c.id,
      contactName: contactNames[(ci + si) % contactNames.length],
      contactPhone: `+55519999${String(1000 + ci * 10 + si)}`,
      secretariat: sec,
      startedAt: iso(start),
      lastMessageAt: iso(start + 210_000),
      messagesCount: msgs.length,
      processesTouched: proc,
      status: si === 0 ? 'active' : si === 1 ? 'waiting_confirmation' : 'closed',
    })
  })
})

/* --------------------------- Catálogo (chat) --------------------------- */

export const catalogMunicipalities = clients.map((c) => ({
  id: `m-${c.id}`,
  name: c.name,
  uf: c.uf,
}))

/** Telefone conhecido para demonstrar o fluxo "reconhecido". */
export const KNOWN_PHONE = '+5551999990001'
