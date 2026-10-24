import type { Banco, Linha } from "../db/banco.js";
import type { Usuario } from "../dashboard/auth.js";
import { ErroApi, exigirCliente } from "../dashboard/repositorio.js";

const texto = (v: unknown) => v as string;
const opcional = (v: unknown) => (v ?? null) as string | null;

const MATURIDADE = { pronta: "ready", "em-revisao": "in_review" } as const;
const naoEncontrado = (o: string) => new ErroApi(404, "NOT_FOUND", `${o} não encontrado`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- Bases de normas ----------

export interface BaseNormas {
  id: string;
  name: string;
  description: string;
  maturity: "ready" | "in_review";
  /** entra automaticamente em todo agente */
  crossCutting: boolean;
  available: boolean;
  processTypes: string[];
  normCount: number;
  syncedAt: string;
}

const paraBase = (r: Linha): BaseNormas => ({
  id: texto(r.id),
  name: texto(r.nome),
  description: texto(r.descricao),
  maturity: MATURIDADE[r.maturidade as keyof typeof MATURIDADE],
  crossCutting: r.transversal === true,
  available: r.disponivel === true,
  processTypes: r.processos_cobertos as string[],
  normCount: Number(r.total_normas ?? 0),
  syncedAt: texto(r.sincronizada_em),
});

const SELECT_BASE = `
  SELECT b.*, (SELECT count(*) FROM public.normas n WHERE n.base_id = b.id) AS total_normas
  FROM public.bases_normas b`;

/** Catálogo para a tela de criação do agente: temáticas prontas primeiro, transversais por último. */
export async function listarBases(db: Banco): Promise<BaseNormas[]> {
  const linhas = await db.consultar(
    `${SELECT_BASE} WHERE b.disponivel ORDER BY b.transversal, (b.maturidade = 'pronta') DESC, b.nome`,
  );
  return linhas.map(paraBase);
}

export interface ResumoNorma {
  id: string;
  title: string;
  kind: string;
  number: string;
  year: number;
  sphere: string;
  summary: string | null;
  officialUrl: string | null;
  coverage: string | null;
  tags: string[];
}

const COLUNAS_RESUMO = "id, titulo, tipo, numero, ano, esfera, ementa, url, abrangencia, tags";

const paraNorma = (r: Linha): ResumoNorma => ({
  id: texto(r.id),
  title: texto(r.titulo),
  kind: texto(r.tipo),
  number: texto(r.numero),
  year: Number(r.ano),
  sphere: texto(r.esfera),
  summary: opcional(r.ementa),
  officialUrl: opcional(r.url),
  coverage: opcional(r.abrangencia),
  tags: r.tags as string[],
});

export async function detalheBase(db: Banco, id: string) {
  const [r] = await db.consultar(`${SELECT_BASE} WHERE b.id = $1`, [id]);
  if (!r) throw naoEncontrado("Base de normas");
  const normas = await db.consultar(`SELECT ${COLUNAS_RESUMO} FROM public.normas WHERE base_id = $1 ORDER BY ano, numero`, [id]);
  return { ...paraBase(r), guide: opcional(r.guia), norms: normas.map(paraNorma) };
}

export async function detalheNorma(db: Banco, baseId: string, normaId: string) {
  const [r] = await db.consultar("SELECT * FROM public.normas WHERE base_id = $1 AND id = $2", [baseId, normaId]);
  if (!r) throw naoEncontrado("Norma");
  return { ...paraNorma(r), baseId, relevance: texto(r.relevancia), text: texto(r.texto) };
}

// ---------- Agentes ----------

export type StatusAgente = "draft" | "active" | "paused";

export interface BaseDoAgente {
  id: string;
  name: string;
  maturity: BaseNormas["maturity"];
  /** "selected": escolhida pelo implantador; "automatic": transversal */
  selection: "selected" | "automatic";
  available: boolean;
}

export interface Agente {
  id: string;
  clientId: string;
  name: string;
  whatsappNumber: string | null;
  status: StatusAgente;
  normBases: BaseDoAgente[];
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
}

async function paraAgente(db: Banco, r: Linha): Promise<Agente> {
  const bases = await db.consultar(
    `SELECT b.id, b.nome, b.maturidade, b.disponivel, ab.origem
     FROM public.agente_bases ab JOIN public.bases_normas b ON b.id = ab.base_id
     WHERE ab.agente_id = $1 ORDER BY (ab.origem = 'automatica'), b.nome`,
    [r.id],
  );
  const [{ n }] = (await db.consultar("SELECT count(*) AS n FROM public.conversas WHERE agente_id = $1", [r.id])) as [{ n: number }];
  return {
    id: texto(r.id),
    clientId: texto(r.cliente_id),
    name: texto(r.nome),
    whatsappNumber: opcional(r.whatsapp),
    status: r.status as StatusAgente,
    normBases: bases.map((b) => ({
      id: texto(b.id),
      name: texto(b.nome),
      maturity: MATURIDADE[b.maturidade as keyof typeof MATURIDADE],
      selection: b.origem === "automatica" ? "automatic" : "selected",
      available: b.disponivel === true,
    })),
    conversationCount: n,
    createdAt: texto(r.criado_em),
    updatedAt: texto(r.atualizado_em),
  };
}

/** Agente no escopo do usuário; de cliente alheio responde 404, para não revelar que existe. */
async function buscarAgente(db: Banco, usuario: Usuario, id: string): Promise<Linha> {
  const [r] = UUID.test(id) ? await db.consultar("SELECT * FROM public.agentes WHERE id = $1", [id]) : [];
  if (!r) throw naoEncontrado("Agente");
  try {
    await exigirCliente(db, usuario, texto(r.cliente_id));
  } catch {
    throw naoEncontrado("Agente");
  }
  return r;
}

export async function listarAgentes(db: Banco, usuario: Usuario, clienteId: string): Promise<Agente[]> {
  await exigirCliente(db, usuario, clienteId);
  const linhas = await db.consultar("SELECT * FROM public.agentes WHERE cliente_id = $1 ORDER BY criado_em", [clienteId]);
  return Promise.all(linhas.map((r) => paraAgente(db, r)));
}

export async function detalheAgente(db: Banco, usuario: Usuario, id: string): Promise<Agente> {
  return paraAgente(db, await buscarAgente(db, usuario, id));
}

/** E.164: "+" e só dígitos, com DDI (ex.: +5551999990000). Mesmo formato de contatos.telefone. */
export function normalizarWhatsapp(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length < 12 || digitos.length > 15) {
    throw new ErroApi(400, "VALIDATION_ERROR", "Número de WhatsApp inválido", {
      whatsappNumber: "use DDI + DDD + número, ex.: +55 51 99999-0000",
    });
  }
  return `+${digitos}`;
}

/**
 * Valida a escolha do implantador e grava agente_bases: as escolhidas (ao menos uma temática)
 * + todas as transversais disponíveis, marcadas como automáticas.
 */
async function gravarBases(tx: Banco, agenteId: string, escolhidas: string[]) {
  const unicas = [...new Set(escolhidas)];
  const achadas = await tx.consultar<{ id: string; transversal: boolean }>(
    "SELECT id, transversal FROM public.bases_normas WHERE id = ANY($1::text[]) AND disponivel",
    [unicas],
  );
  const faltando = unicas.filter((id) => !achadas.some((b) => b.id === id));
  if (faltando.length) {
    throw new ErroApi(400, "VALIDATION_ERROR", "Base de normas inexistente ou indisponível", { normBaseIds: faltando.join(", ") });
  }
  if (!achadas.some((b) => !b.transversal)) {
    throw new ErroApi(400, "VALIDATION_ERROR", "Selecione ao menos uma base temática", {
      normBaseIds: "as transversais já entram automaticamente; escolha a do assunto do agente (ex.: planejamento-urbano)",
    });
  }
  await tx.consultar("DELETE FROM public.agente_bases WHERE agente_id = $1", [agenteId]);
  await tx.consultar(
    `INSERT INTO public.agente_bases (agente_id, base_id, origem)
     SELECT $1::uuid, id, 'selecionada'::public.origem_base_agente FROM unnest($2::text[]) AS id
     UNION
     SELECT $1::uuid, b.id, 'automatica'::public.origem_base_agente FROM public.bases_normas b
     WHERE b.transversal AND b.disponivel AND NOT (b.id = ANY($2::text[]))`,
    [agenteId, unicas],
  );
}

async function exigirWhatsappLivre(db: Banco, numero: string, agenteId?: string) {
  const [dono] = await db.consultar<{ id: string }>("SELECT id FROM public.agentes WHERE whatsapp = $1", [numero]);
  if (dono && dono.id !== agenteId) throw new ErroApi(409, "CONFLICT", "Este número de WhatsApp já está ligado a outro agente");
}

export interface DadosAgente {
  name: string;
  whatsappNumber?: string | null;
  status?: StatusAgente;
  normBaseIds: string[];
}

const exigirWhatsappParaAtivar = (status: StatusAgente, whatsapp: string | null) => {
  if (status === "active" && !whatsapp) throw new ErroApi(400, "VALIDATION_ERROR", "Para ativar, informe o número de WhatsApp");
};

export async function criarAgente(db: Banco, usuario: Usuario, clienteId: string, dados: DadosAgente): Promise<Agente> {
  await exigirCliente(db, usuario, clienteId);
  const whatsapp = dados.whatsappNumber ? normalizarWhatsapp(dados.whatsappNumber) : null;
  const status = dados.status ?? "draft";
  exigirWhatsappParaAtivar(status, whatsapp);

  const id = await db.transacao(async (tx) => {
    if (whatsapp) await exigirWhatsappLivre(tx, whatsapp);
    const [r] = await tx.consultar<{ id: string }>(
      "INSERT INTO public.agentes (cliente_id, nome, whatsapp, status, criado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [clienteId, dados.name.trim(), whatsapp, status, usuario.id],
    );
    await gravarBases(tx, r!.id, dados.normBaseIds);
    return r!.id;
  });
  return detalheAgente(db, usuario, id);
}

export async function atualizarAgente(db: Banco, usuario: Usuario, id: string, dados: Partial<DadosAgente>): Promise<Agente> {
  const atual = await buscarAgente(db, usuario, id);
  const whatsapp =
    dados.whatsappNumber === undefined ? opcional(atual.whatsapp) : dados.whatsappNumber ? normalizarWhatsapp(dados.whatsappNumber) : null;
  const status = dados.status ?? (atual.status as StatusAgente);
  exigirWhatsappParaAtivar(status, whatsapp);

  await db.transacao(async (tx) => {
    if (whatsapp) await exigirWhatsappLivre(tx, whatsapp, id);
    await tx.consultar("UPDATE public.agentes SET nome = $1, whatsapp = $2, status = $3 WHERE id = $4", [
      dados.name?.trim() ?? texto(atual.nome),
      whatsapp,
      status,
      id,
    ]);
    if (dados.normBaseIds) await gravarBases(tx, id, dados.normBaseIds);
  });
  return detalheAgente(db, usuario, id);
}

/** Liga (ou desliga, com null) o agente que atende uma conversa. Agente e conversa precisam ser da mesma prefeitura. */
export async function vincularConversa(db: Banco, usuario: Usuario, conversaId: string, agenteId: string | null) {
  const [conversa] = UUID.test(conversaId)
    ? await db.consultar("SELECT id, cliente_id FROM public.conversas WHERE id = $1", [conversaId])
    : [];
  if (!conversa) throw naoEncontrado("Conversa");
  try {
    await exigirCliente(db, usuario, texto(conversa.cliente_id));
  } catch {
    throw naoEncontrado("Conversa");
  }
  if (agenteId) {
    const agente = await buscarAgente(db, usuario, agenteId);
    if (agente.cliente_id !== conversa.cliente_id) {
      throw new ErroApi(400, "VALIDATION_ERROR", "O agente pertence a outra prefeitura", { agentId: agenteId });
    }
  }
  await db.consultar("UPDATE public.conversas SET agente_id = $1 WHERE id = $2", [agenteId, conversaId]);
  return { conversationId: conversaId, agentId: agenteId };
}

/**
 * O que o agente de WhatsApp pode consultar: as bases dele, com o guia e a relevância de cada norma.
 * O texto integral fica de fora (pedir por norma em /norm-bases/:id/norms/:normId).
 */
export async function conhecimentoDoAgente(db: Banco, usuario: Usuario, id: string) {
  const agente = await detalheAgente(db, usuario, id);
  const ids = agente.normBases.map((b) => b.id);
  const [guias, normas] = await Promise.all([
    db.consultar<{ id: string; guia: string | null }>("SELECT id, guia FROM public.bases_normas WHERE id = ANY($1::text[])", [ids]),
    db.consultar(`SELECT base_id, ${COLUNAS_RESUMO}, relevancia FROM public.normas WHERE base_id = ANY($1::text[]) ORDER BY ano, numero`, [ids]),
  ]);
  return {
    agentId: agente.id,
    bases: agente.normBases.map((b) => ({
      ...b,
      guide: guias.find((g) => g.id === b.id)?.guia ?? null,
      norms: normas.filter((n) => n.base_id === b.id).map((n) => ({ ...paraNorma(n), relevance: texto(n.relevancia) })),
    })),
  };
}
