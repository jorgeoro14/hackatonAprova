import type { Banco, Linha } from "../db/banco.js";
import type { Usuario } from "./auth.js";
import { agregarClientes, COMPLETOS_SQL, statusCliente, type StatusCliente } from "./metricas.js";

/** Erro no formato do contrato: { error: { code, message, details } }. */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const naoEncontrado = (o: string) => new ErroApi(404, "NOT_FOUND", `${o} não encontrado`);

const texto = (v: unknown) => v as string;
const numero = (v: unknown) => Number(v);
const opcional = (v: unknown) => (v ?? null) as string | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids vêm da URL; um valor que não é uuid não existe (e não deve virar erro 500 no cast do Postgres). */
const ehUuid = (id: string) => UUID.test(id);

async function uma(db: Banco, sql: string, params: unknown[]): Promise<Linha | undefined> {
  return (await db.consultar(sql, params))[0];
}

// ---------- Usuários ----------

export async function buscarUsuarioPorUsername(db: Banco, username: string) {
  const r = await uma(db, "SELECT id, nome, username, papel, senha_hash FROM usuarios WHERE username = $1", [username]);
  return r && { usuario: paraUsuario(r), senhaHash: texto(r.senha_hash) };
}

export async function buscarUsuario(db: Banco, id: string): Promise<Usuario | undefined> {
  if (!ehUuid(id)) return undefined;
  const r = await uma(db, "SELECT id, nome, username, papel FROM usuarios WHERE id = $1", [id]);
  return r && paraUsuario(r);
}

const paraUsuario = (r: Linha): Usuario => ({
  id: texto(r.id), name: texto(r.nome), username: texto(r.username), role: r.papel as Usuario["role"],
});

// ---------- Escopo ----------

export interface FiltroEscopo {
  implementerId?: string;
  clientId?: string;
}

/**
 * Ids dos clientes que o usuário pode ver, já com os filtros aplicados.
 * Implantador: só os seus (pedir outro implantador → 403; cliente alheio → 404). Head: todos, filtráveis.
 */
export async function clientesNoEscopo(db: Banco, usuario: Usuario, filtro: FiltroEscopo = {}): Promise<string[]> {
  let implantador = filtro.implementerId;
  if (usuario.role === "implementer") {
    if (implantador && implantador !== usuario.id) throw new ErroApi(403, "FORBIDDEN", "Sem permissão para ver outro implantador");
    implantador = usuario.id;
  } else if (implantador && (!ehUuid(implantador) || !(await uma(db, "SELECT 1 FROM usuarios WHERE id = $1 AND papel = 'implementer'", [implantador])))) {
    throw naoEncontrado("Implantador");
  }

  const ids = (
    implantador
      ? await db.consultar<{ id: string }>("SELECT id FROM clientes WHERE implantador_id = $1", [implantador])
      : await db.consultar<{ id: string }>("SELECT id FROM clientes")
  ).map((r) => r.id);

  if (filtro.clientId) {
    if (!ids.includes(filtro.clientId)) throw naoEncontrado("Cliente");
    return [filtro.clientId];
  }
  return ids;
}

/** Garante que o cliente está no escopo do usuário (senão 404, para não revelar que existe). */
export async function exigirCliente(db: Banco, usuario: Usuario, clienteId: string) {
  await clientesNoEscopo(db, usuario, { clientId: clienteId });
}

// ---------- Paginação ----------

export interface Pagina<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface OpcoesPagina {
  page: number;
  pageSize: number;
}

const paginar = <T>(todos: T[], { page, pageSize }: OpcoesPagina): Pagina<T> => ({
  items: todos.slice((page - 1) * pageSize, page * pageSize),
  page,
  pageSize,
  total: todos.length,
});

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const contem = (valor: string, q?: string) => !q || semAcento(valor).includes(semAcento(q));

// ---------- Clientes ----------

export interface Cliente {
  id: string;
  name: string;
  uf: string;
  implementerId: string;
  implementerName: string;
  status: StatusCliente;
  startedAt: string;
  targetDate: string;
  processesTotal: number;
  processesComplete: number;
  secretariatsTotal: number;
  secretariatsDone: number;
  meetingsCount: number;
  hoursSavedMinutes: number;
  flowCreationMinutes: number | null;
}

export async function listarClientes(db: Banco, ids: string[], agora: Date): Promise<Cliente[]> {
  if (ids.length === 0) return [];
  const [linhas, agregados] = await Promise.all([
    db.consultar(
      `SELECT c.id, c.nome, c.uf, c.implantador_id, u.nome AS implantador_nome, c.iniciado_em, c.data_meta
       FROM clientes c JOIN usuarios u ON u.id = c.implantador_id
       WHERE c.id = ANY($1::uuid[]) ORDER BY c.nome`,
      [ids],
    ),
    agregarClientes(db, ids),
  ]);
  return linhas.map((r) => {
    const a = agregados.get(texto(r.id))!;
    return {
      id: texto(r.id),
      name: texto(r.nome),
      uf: texto(r.uf),
      implementerId: texto(r.implantador_id),
      implementerName: texto(r.implantador_nome),
      status: statusCliente(a, texto(r.iniciado_em), texto(r.data_meta), agora),
      startedAt: texto(r.iniciado_em),
      targetDate: texto(r.data_meta),
      processesTotal: a.processesTotal,
      processesComplete: a.processesComplete,
      secretariatsTotal: a.secretariatsTotal,
      secretariatsDone: a.secretariatsDone,
      meetingsCount: a.meetingsCount,
      hoursSavedMinutes: a.hoursSavedMinutes,
      flowCreationMinutes: a.flowCreationMinutes,
    };
  });
}

export async function paginaClientes(
  db: Banco,
  ids: string[],
  agora: Date,
  filtro: { status?: string; q?: string },
  pagina: OpcoesPagina,
): Promise<Pagina<Cliente>> {
  const todos = (await listarClientes(db, ids, agora)).filter(
    (c) => (!filtro.status || c.status === filtro.status) && contem(c.name, filtro.q),
  );
  return paginar(todos, pagina);
}

export async function detalheCliente(db: Banco, id: string, agora: Date) {
  const [cliente] = await listarClientes(db, [id], agora);
  if (!cliente) throw naoEncontrado("Cliente");
  const secretariats = (
    await db.consultar(
      `SELECT s.id, s.nome, COUNT(p.id) AS total, COUNT(p.id) FILTER (WHERE p.status IN (${COMPLETOS_SQL})) AS completos
       FROM secretarias s LEFT JOIN processos p ON p.secretaria_id = s.id
       WHERE s.cliente_id = $1 GROUP BY s.id ORDER BY s.nome`,
      [id],
    )
  ).map((r) => ({ id: texto(r.id), name: texto(r.nome), processesTotal: numero(r.total), processesComplete: numero(r.completos) }));
  return { ...cliente, secretariats };
}

// ---------- Processos ----------

export type StatusProcesso = "not_started" | "collecting" | "awaiting_confirmation" | "confirmed" | "sent_to_dev" | "validated";

export interface Processo {
  id: string;
  clientId: string;
  name: string;
  secretariat: string;
  status: StatusProcesso;
  completeness: number;
  backAndForths: number;
  updatedAt: string;
}

const SQL_PROCESSO = `
  SELECT p.id, p.cliente_id, p.secretaria_id, p.nome, s.nome AS secretaria, p.status, p.idas_e_vindas, p.atualizado_em,
         (SELECT COUNT(*) FROM campos_processo c WHERE c.processo_id = p.id) AS campos,
         (SELECT COUNT(*) FROM campos_processo c WHERE c.processo_id = p.id AND c.status = 'filled') AS preenchidos
  FROM processos p JOIN secretarias s ON s.id = p.secretaria_id`;

const paraProcesso = (r: Linha): Processo => ({
  id: texto(r.id),
  clientId: texto(r.cliente_id),
  name: texto(r.nome),
  secretariat: texto(r.secretaria),
  status: r.status as StatusProcesso,
  // % do formulário preenchido; sem campos definidos ainda, 0
  completeness: numero(r.campos) > 0 ? Math.round((numero(r.preenchidos) / numero(r.campos)) * 100) : 0,
  backAndForths: numero(r.idas_e_vindas),
  updatedAt: texto(r.atualizado_em),
});

export async function paginaProcessos(
  db: Banco,
  clienteId: string,
  filtro: { secretariat?: string; status?: string; q?: string },
  pagina: OpcoesPagina,
): Promise<Pagina<Processo>> {
  const todos = (await db.consultar(`${SQL_PROCESSO} WHERE p.cliente_id = $1 ORDER BY s.nome, p.nome`, [clienteId]))
    // secretariat aceita id ou nome
    .filter((r) => !filtro.secretariat || r.secretaria === filtro.secretariat || r.secretaria_id === filtro.secretariat)
    .map(paraProcesso)
    .filter((p) => (!filtro.status || p.status === filtro.status) && contem(p.name, filtro.q));
  return paginar(todos, pagina);
}

/** Processo com campos, se estiver no escopo do usuário. */
export async function detalheProcesso(db: Banco, usuario: Usuario, id: string) {
  const r = ehUuid(id) ? await uma(db, `${SQL_PROCESSO} WHERE p.id = $1`, [id]) : undefined;
  if (!r || !(await clientesNoEscopo(db, usuario)).includes(texto(r.cliente_id))) throw naoEncontrado("Processo");
  const fields = (
    await db.consultar(
      `SELECT chave, rotulo, valor, status, mensagem_origem_id, anexo_origem_id
       FROM campos_processo WHERE processo_id = $1 ORDER BY criado_em, chave`,
      [id],
    )
  ).map((c) => ({
    key: texto(c.chave),
    label: texto(c.rotulo),
    value: opcional(c.valor),
    status: c.status as "filled" | "pending" | "to_validate",
    ...(c.mensagem_origem_id ? { sourceMessageId: texto(c.mensagem_origem_id) } : {}),
    ...(c.anexo_origem_id ? { sourceAttachmentId: texto(c.anexo_origem_id) } : {}),
  }));
  return { ...paraProcesso(r), fields };
}

/**
 * Muda o status de um processo mantendo os carimbos que alimentam as métricas.
 * Uma "ida e volta" é cada vez que o processo volta para coleta depois de ter sido
 * apresentado ou confirmado (a prefeitura precisou corrigir/complementar).
 */
export async function mudarStatusProcesso(db: Banco, id: string, novo: StatusProcesso, agora = new Date()) {
  const atual = ehUuid(id) ? await uma(db, "SELECT status, concluido_em, validado_em FROM processos WHERE id = $1", [id]) : undefined;
  if (!atual) throw naoEncontrado("Processo");
  const de = atual.status as StatusProcesso;
  if (de === novo) return;
  const t = agora.toISOString();
  const voltou = novo === "collecting" && de !== "not_started";
  const completo = novo === "confirmed" || novo === "sent_to_dev" || novo === "validated";
  await db.consultar(
    `UPDATE processos SET status = $1,
       idas_e_vindas = idas_e_vindas + $2,
       primeiro_contato_em = COALESCE(primeiro_contato_em, $3),
       concluido_em = $4,
       validado_em = $5
     WHERE id = $6`,
    [
      novo,
      voltou ? 1 : 0,
      novo === "not_started" ? null : t,
      completo ? (opcional(atual.concluido_em) ?? t) : null,
      novo === "validated" ? (opcional(atual.validado_em) ?? t) : null,
      id,
    ],
  );
}

// ---------- Conversas ----------

export interface Conversa {
  id: string;
  clientId: string;
  contactName: string;
  contactPhone: string;
  secretariat: string | null;
  startedAt: string;
  lastMessageAt: string;
  messagesCount: number;
  processesTouched: string[];
  status: "active" | "waiting_confirmation" | "closed";
}

const SQL_CONVERSA = `
  SELECT cv.id, cv.cliente_id, ct.nome AS contato, ct.telefone, s.nome AS secretaria, cv.iniciada_em, cv.ultima_mensagem_em, cv.status,
         (SELECT COUNT(*) FROM mensagens m WHERE m.conversa_id = cv.id) AS n_mensagens,
         COALESCE((SELECT json_agg(p.nome ORDER BY p.nome) FROM conversa_processos cp JOIN processos p ON p.id = cp.processo_id
                    WHERE cp.conversa_id = cv.id), '[]'::json) AS processos
  FROM conversas cv JOIN contatos ct ON ct.id = cv.contato_id LEFT JOIN secretarias s ON s.id = cv.secretaria_id`;

const paraConversa = (r: Linha): Conversa => ({
  id: texto(r.id),
  clientId: texto(r.cliente_id),
  contactName: texto(r.contato),
  contactPhone: texto(r.telefone),
  secretariat: opcional(r.secretaria),
  startedAt: texto(r.iniciada_em),
  lastMessageAt: texto(r.ultima_mensagem_em),
  messagesCount: numero(r.n_mensagens),
  processesTouched: r.processos as string[],
  status: r.status as Conversa["status"],
});

export async function paginaConversas(db: Banco, clienteId: string, pagina: OpcoesPagina): Promise<Pagina<Conversa>> {
  const todas = (await db.consultar(`${SQL_CONVERSA} WHERE cv.cliente_id = $1 ORDER BY cv.ultima_mensagem_em DESC`, [clienteId])).map(
    paraConversa,
  );
  return paginar(todas, pagina);
}

export async function detalheConversa(db: Banco, usuario: Usuario, id: string) {
  const r = ehUuid(id) ? await uma(db, `${SQL_CONVERSA} WHERE cv.id = $1`, [id]) : undefined;
  if (!r || !(await clientesNoEscopo(db, usuario)).includes(texto(r.cliente_id))) throw naoEncontrado("Conversa");
  const messages = (
    await db.consultar("SELECT id, papel, tipo, texto, dados, criada_em FROM mensagens WHERE conversa_id = $1 ORDER BY criada_em, id", [id])
  ).map((m) => {
    const dados = (m.dados ?? {}) as Record<string, unknown>;
    return {
      id: texto(m.id),
      role: m.papel as "user" | "agent" | "system",
      kind: m.tipo as "text" | "quick_replies" | "form",
      text: texto(m.texto),
      createdAt: texto(m.criada_em),
      attachments: (dados.attachments as unknown[]) ?? [],
      ...(dados.quickReplies ? { quickReplies: dados.quickReplies } : {}),
      ...(dados.form ? { form: dados.form } : {}),
    };
  });
  return { ...paraConversa(r), messages };
}

// ---------- Reuniões ----------

export interface Reuniao {
  id: string;
  clientId: string;
  date: string;
  durationMinutes: number;
  notes: string;
  createdBy: string | null;
  createdAt: string;
}

const paraReuniao = (r: Linha): Reuniao => ({
  id: texto(r.id),
  clientId: texto(r.cliente_id),
  date: texto(r.realizada_em),
  durationMinutes: numero(r.duracao_minutos),
  notes: texto(r.notas),
  createdBy: opcional(r.registrada_por),
  createdAt: texto(r.criado_em),
});

export async function listarReunioes(db: Banco, clienteId: string): Promise<Reuniao[]> {
  return (await db.consultar("SELECT * FROM reunioes WHERE cliente_id = $1 ORDER BY realizada_em DESC", [clienteId])).map(paraReuniao);
}

export async function registrarReuniao(
  db: Banco,
  clienteId: string,
  dados: { date: string; durationMinutes: number; notes?: string },
  usuarioId: string,
  agora = new Date(),
): Promise<Reuniao> {
  const [r] = await db.consultar(
    `INSERT INTO reunioes (cliente_id, realizada_em, duracao_minutos, notas, registrada_por, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [clienteId, new Date(dados.date).toISOString(), dados.durationMinutes, dados.notes ?? "", usuarioId, agora.toISOString()],
  );
  return paraReuniao(r!);
}

// ---------- Implantadores (head) ----------

export interface ResumoImplantador {
  id: string;
  name: string;
  clientsCount: number;
  processesTotal: number;
  processesComplete: number;
  meetingsCount: number;
  hoursSavedMinutes: number;
  flowCreationAvgMinutes: number | null;
  clientsAtRisk: number;
}

export async function listarImplantadores(db: Banco, agora: Date, apenas?: string): Promise<(ResumoImplantador & { clientes: Cliente[] })[]> {
  if (apenas && !ehUuid(apenas)) return [];
  const implantadores = await db.consultar<{ id: string; nome: string }>(
    `SELECT id, nome FROM usuarios WHERE papel = 'implementer' ${apenas ? "AND id = $1" : ""} ORDER BY nome`,
    apenas ? [apenas] : [],
  );
  const todosClientes = (await db.consultar<{ id: string }>("SELECT id FROM clientes")).map((r) => r.id);
  const [clientes, agregados] = await Promise.all([listarClientes(db, todosClientes, agora), agregarClientes(db, todosClientes)]);

  return implantadores.map((u) => {
    const meus = clientes.filter((c) => c.implementerId === u.id);
    const amostras = meus.flatMap((c) => agregados.get(c.id)!.flowCreationSamples);
    const soma = (f: (c: Cliente) => number) => meus.reduce((s, c) => s + f(c), 0);
    return {
      id: u.id,
      name: u.nome,
      clientsCount: meus.length,
      processesTotal: soma((c) => c.processesTotal),
      processesComplete: soma((c) => c.processesComplete),
      meetingsCount: soma((c) => c.meetingsCount),
      hoursSavedMinutes: soma((c) => c.hoursSavedMinutes),
      // média sobre todos os fluxos validados do implantador (não média das médias dos clientes)
      flowCreationAvgMinutes: amostras.length ? Math.round(amostras.reduce((a, b) => a + b, 0) / amostras.length) : null,
      clientsAtRisk: meus.filter((c) => c.status === "at_risk").length,
      clientes: meus,
    };
  });
}
