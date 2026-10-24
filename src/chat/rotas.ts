import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ErroAgente, type AnexoAgente, type ClienteAgente, type MensagemAgente } from "../agente/cliente.js";
import { tratarErros } from "../api/erros.js";
import { verificarToken } from "../dashboard/auth.js";
import { buscarUsuario, clientesNoEscopo, ErroApi } from "../dashboard/repositorio.js";
import type { Banco, Linha } from "../db/banco.js";
import { FormularioImplantacao, lacunas } from "../implantacao/formulario.js";
import type { BaseConhecimento } from "../knowledge/loader.js";
import { formularioAberto, paraFormulario, salvarRevisao, sincronizarProcesso } from "../formularios/repositorio.js";

export interface OpcoesChat {
  db: Banco;
  segredoJwt: string;
  base: BaseConhecimento;
  /** Serviço do agente; sem ele, enviar mensagem responde 503 */
  agente?: ClienteAgente;
  /** Onde os anexos ficam no disco */
  uploadDir?: string;
  /** Requisições por minuto nos endpoints públicos */
  limitePorMinuto?: number;
  agora?: () => Date;
}

const TIPOS_ANEXO = new Set(["pdf", "png", "jpg", "jpeg", "webp", "xlsx", "xls", "csv", "docx", "txt"]);
const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;
const MAX_ANEXOS_POR_MENSAGEM = 5;
const MAX_TEXTO_ANEXO = 20_000;
const VALIDADE_REGISTRO_MS = 15 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Telefone = z.string().regex(/^\+\d{10,15}$/, "telefone deve estar em E.164, ex.: +5551999998888");
const Identify = z.object({ phone: Telefone });
const Referencia = z.union([z.object({ id: z.string().min(1) }), z.object({ name: z.string().trim().min(1).max(200) })]);
const Register = z.object({
  registrationToken: z.string().min(1),
  phone: Telefone,
  name: z.string().trim().min(1).max(200),
  municipality: Referencia,
  secretariat: Referencia,
});
const NovaMensagem = z.object({
  text: z.string().max(4000).default(""),
  attachmentIds: z.array(z.string()).max(MAX_ANEXOS_POR_MENSAGEM).default([]),
  quickReplyId: z.string().nullish(),
});

function validar<T>(schema: z.ZodType<T>, dados: unknown): T {
  const r = schema.safeParse(dados ?? {});
  if (r.success) return r.data;
  throw new ErroApi(400, "VALIDATION_ERROR", "Parâmetros inválidos", detalhes(r.error));
}
const detalhes = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [i.path.join(".") || "_", i.message]));

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** "Prefeitura de Canoas" e "canoas" são a mesma prefeitura. */
const chaveMunicipio = (s: string) => semAcento(s).replace(/^prefeitura (municipal )?(de |do |da )?/, "");

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const iguais = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Token de cadastro sem estado: telefone + validade assinados com o segredo do servidor. */
function emitirRegistro(phone: string, segredo: string, agora: Date) {
  const corpo = Buffer.from(JSON.stringify({ phone, exp: agora.getTime() + VALIDADE_REGISTRO_MS })).toString("base64url");
  return `${corpo}.${createHmac("sha256", segredo).update(`registro.${corpo}`).digest("base64url")}`;
}
function registroValido(token: string, phone: string, segredo: string, agora: Date): boolean {
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return false;
  const esperada = createHmac("sha256", segredo).update(`registro.${corpo}`).digest("base64url");
  if (!iguais(esperada, assinatura)) return false;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString()) as { phone?: string; exp?: number };
    return d.phone === phone && typeof d.exp === "number" && d.exp > agora.getTime();
  } catch {
    return false;
  }
}

/** Domínio de conhecimento da conversa, pelo nome da secretaria; sem pista, o primeiro não transversal. */
export function dominioDaSecretaria(base: BaseConhecimento, secretaria: string): string {
  const n = semAcento(secretaria);
  const palpites: [RegExp, string][] = [
    [/ambient/, "meio-ambiente"],
    [/obra|urban|planej|habita/, "obras"],
  ];
  for (const [re, id] of palpites) if (re.test(n) && base.dominios.has(id)) return id;
  const dominios = [...base.dominios.values()].map((d) => d.dominio);
  return (dominios.find((d) => !d.transversal) ?? dominios[0])?.id ?? "obras";
}

interface Mensagem {
  id: string;
  role: "user" | "agent" | "system";
  kind: "text" | "quick_replies" | "form";
  text: string;
  createdAt: string;
  attachments: unknown[];
  quickReplies?: unknown;
  formularioId?: string;
}

export const paraMensagem = (m: Linha): Mensagem => {
  const dados = (m.dados ?? {}) as Record<string, unknown>;
  return {
    id: m.id as string,
    role: m.papel as Mensagem["role"],
    kind: m.tipo as Mensagem["kind"],
    text: m.texto as string,
    createdAt: m.criada_em as string,
    attachments: (dados.attachments as unknown[]) ?? [],
    ...(dados.quickReplies ? { quickReplies: dados.quickReplies } : {}),
    ...(dados.formularioId ? { formularioId: dados.formularioId as string } : {}),
  };
};

const paraAnexo = (a: Linha, prefixo: string) => ({
  id: a.id as string, name: a.nome as string, mimeType: a.mime as string, sizeBytes: a.tamanho as number, url: `${prefixo}/files/${a.id as string}`,
});

/** Rotas públicas do chat (X-Session-Token), catálogo e arquivos. Registrar com prefixo /api/v1. */
export async function rotasChat(app: FastifyInstance, opcoes: OpcoesChat) {
  const { db, segredoJwt, base, agente, uploadDir = "uploads", limitePorMinuto = 30 } = opcoes;
  const agora = opcoes.agora ?? (() => new Date());
  const prefixo = "/api/v1";

  tratarErros(app);
  await app.register(rateLimit, { max: limitePorMinuto, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: LIMITE_ANEXO_BYTES, files: 1 } });

  /** Uma mensagem por vez por sessão: o histórico precisa ficar em ordem. */
  const ocupadas = new Set<string>();
  async function exclusivo<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    if (ocupadas.has(sessionId)) throw new ErroApi(409, "CONFLICT", "A mensagem anterior ainda está sendo processada");
    ocupadas.add(sessionId);
    try {
      return await fn();
    } finally {
      ocupadas.delete(sessionId);
    }
  }

  const naoAutorizada = () => new ErroApi(401, "UNAUTHORIZED", "Sessão inválida ou expirada");

  /** Conversa da sessão, se o X-Session-Token confere (id inexistente e token errado dão o mesmo 401). */
  async function sessao(req: FastifyRequest<{ Params: { sessionId: string } }>): Promise<Linha> {
    const { sessionId } = req.params;
    const token = req.headers["x-session-token"];
    const r = UUID.test(sessionId) ? (await db.consultar("SELECT * FROM conversas WHERE id = $1", [sessionId]))[0] : undefined;
    if (!r || typeof token !== "string" || !r.token_sessao_hash || !iguais(hashToken(token), r.token_sessao_hash as string)) throw naoAutorizada();
    return r;
  }

  async function contato(conversa: Linha) {
    const r = (
      await db.consultar(
        `SELECT ct.nome, cl.id AS cliente_id, cl.nome AS cliente, s.id AS secretaria_id, s.nome AS secretaria
         FROM contatos ct JOIN clientes cl ON cl.id = $2
         LEFT JOIN secretarias s ON s.id = COALESCE($3::uuid, ct.secretaria_id)
         WHERE ct.id = $1`,
        [conversa.contato_id, conversa.cliente_id, conversa.secretaria_id],
      )
    )[0]!;
    return {
      name: r.nome as string,
      municipality: { id: r.cliente_id as string, name: r.cliente as string },
      secretariat: { id: (r.secretaria_id as string | null) ?? "", name: (r.secretaria as string | null) ?? "—" },
    };
  }

  async function abrirSessao(conversaId: string) {
    const token = randomBytes(32).toString("base64url");
    await db.consultar("UPDATE conversas SET token_sessao_hash = $1 WHERE id = $2", [hashToken(token), conversaId]);
    return token;
  }

  async function gravarMensagem(tx: Banco, conversaId: string, papel: "user" | "agent", tipo: "text" | "form", texto: string, dados: unknown = null) {
    const r = await tx.consultar(
      "INSERT INTO mensagens (conversa_id, papel, tipo, texto, dados) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *",
      [conversaId, papel, tipo, texto, dados === null ? null : JSON.stringify(dados)],
    );
    await tx.consultar("UPDATE conversas SET ultima_mensagem_em = now() WHERE id = $1", [conversaId]);
    return paraMensagem(r[0]!);
  }

  // ---------- Catálogo (público) ----------

  app.get("/catalog/municipalities", async (req) => {
    const { q } = validar(z.object({ q: z.string().optional() }), req.query);
    const todos = await db.consultar<{ id: string; nome: string; uf: string }>("SELECT id, nome, uf FROM clientes ORDER BY nome");
    const chave = q ? chaveMunicipio(q) : "";
    return todos.filter((c) => !chave || chaveMunicipio(c.nome).includes(chave) || semAcento(c.nome).includes(semAcento(q!))).map((c) => ({ id: c.id, name: c.nome, uf: c.uf }));
  });

  app.get<{ Params: { id: string } }>("/catalog/municipalities/:id/secretariats", async (req) => {
    if (!UUID.test(req.params.id)) throw new ErroApi(404, "NOT_FOUND", "Prefeitura não encontrada");
    const cliente = await db.consultar("SELECT 1 FROM clientes WHERE id = $1", [req.params.id]);
    if (!cliente.length) throw new ErroApi(404, "NOT_FOUND", "Prefeitura não encontrada");
    return (await db.consultar<{ id: string; nome: string }>("SELECT id, nome FROM secretarias WHERE cliente_id = $1 ORDER BY nome", [req.params.id])).map((s) => ({ id: s.id, name: s.nome }));
  });

  // ---------- Identificação e cadastro ----------

  async function abrirOuRetomarConversa(c: { id: string; nome: string; cliente_id: string; secretaria_id: string | null }) {
    const ativa = (
      await db.consultar("SELECT * FROM conversas WHERE contato_id = $1 AND status <> 'closed' ORDER BY ultima_mensagem_em DESC LIMIT 1", [c.id])
    )[0];
    if (ativa) return ativa;
    return db.transacao(async (tx) => {
      const nova = (
        await tx.consultar("INSERT INTO conversas (cliente_id, contato_id, secretaria_id) VALUES ($1, $2, $3) RETURNING *", [c.cliente_id, c.id, c.secretaria_id])
      )[0]!;
      const sec = c.secretaria_id ? (await tx.consultar<{ nome: string }>("SELECT nome FROM secretarias WHERE id = $1", [c.secretaria_id]))[0]?.nome : undefined;
      const saudacao = `Olá, ${c.nome.split(" ")[0]}! Sou o assistente de implantação da Aprova. Vamos mapear as regras dos processos${sec ? ` da **${sec}**` : ""}. Qual processo você quer configurar primeiro?`;
      await gravarMensagem(tx, nova.id as string, "agent", "text", saudacao);
      return nova;
    });
  }

  app.post("/chat/identify", async (req) => {
    const { phone } = validar(Identify, req.body);
    const c = (await db.consultar<{ id: string; nome: string; cliente_id: string; secretaria_id: string | null }>("SELECT id, nome, cliente_id, secretaria_id FROM contatos WHERE telefone = $1", [phone]))[0];
    if (!c) return { known: false, registrationToken: emitirRegistro(phone, segredoJwt, agora()) };
    const conversa = await abrirOuRetomarConversa(c);
    const sessionToken = await abrirSessao(conversa.id as string);
    return { known: true, sessionId: conversa.id, sessionToken, contact: await contato(conversa) };
  });

  async function resolverMunicipio(ref: z.infer<typeof Referencia>): Promise<string> {
    if ("id" in ref) {
      if (!UUID.test(ref.id) || !(await db.consultar("SELECT 1 FROM clientes WHERE id = $1", [ref.id])).length) {
        throw new ErroApi(422, "VALIDATION_ERROR", "Prefeitura não encontrada", { municipality: "id inexistente" });
      }
      return ref.id;
    }
    const chave = chaveMunicipio(ref.name);
    const existentes = await db.consultar<{ id: string; nome: string }>("SELECT id, nome FROM clientes");
    const achado = existentes.find((c) => chaveMunicipio(c.nome) === chave);
    if (achado) return achado.id;
    // fora do catálogo: cria a prefeitura com o implantador de menor carga; o time confere o cadastro depois
    const implantador = (
      await db.consultar<{ id: string }>(
        `SELECT u.id FROM usuarios u LEFT JOIN clientes c ON c.implantador_id = u.id
         WHERE u.papel = 'implementer' GROUP BY u.id ORDER BY count(c.id), u.username LIMIT 1`,
      )
    )[0];
    if (!implantador) throw new ErroApi(503, "UNAVAILABLE", "Nenhum implantador disponível para receber o cadastro");
    const inicio = agora();
    const nome = /^prefeitura/i.test(ref.name) ? ref.name : `Prefeitura de ${ref.name}`;
    const r = await db.consultar<{ id: string }>(
      "INSERT INTO clientes (nome, uf, implantador_id, iniciado_em, data_meta) VALUES ($1, '--', $2, $3, $4) RETURNING id",
      [nome, implantador.id, inicio.toISOString(), new Date(inicio.getTime() + 60 * 86_400_000).toISOString()],
    );
    return r[0]!.id;
  }

  async function resolverSecretaria(clienteId: string, ref: z.infer<typeof Referencia>): Promise<string> {
    if ("id" in ref) {
      const r = UUID.test(ref.id) ? await db.consultar("SELECT id FROM secretarias WHERE id = $1 AND cliente_id = $2", [ref.id, clienteId]) : [];
      if (!r.length) throw new ErroApi(422, "VALIDATION_ERROR", "Secretaria não pertence à prefeitura", { secretariat: "id inexistente" });
      return ref.id;
    }
    const r = await db.consultar<{ id: string }>(
      "INSERT INTO secretarias (cliente_id, nome) VALUES ($1, $2) ON CONFLICT (cliente_id, nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id",
      [clienteId, ref.name],
    );
    return r[0]!.id;
  }

  app.post("/chat/register", async (req, reply) => {
    const dados = validar(Register, req.body);
    if (!registroValido(dados.registrationToken, dados.phone, segredoJwt, agora())) {
      throw new ErroApi(401, "UNAUTHORIZED", "Cadastro expirado; informe o telefone novamente");
    }
    if ((await db.consultar("SELECT 1 FROM contatos WHERE telefone = $1", [dados.phone])).length) {
      throw new ErroApi(409, "CONFLICT", "Este telefone já está cadastrado");
    }
    const clienteId = await resolverMunicipio(dados.municipality);
    const secretariaId = await resolverSecretaria(clienteId, dados.secretariat);
    const c = (
      await db.consultar<{ id: string; nome: string; cliente_id: string; secretaria_id: string | null }>(
        "INSERT INTO contatos (nome, telefone, cliente_id, secretaria_id) VALUES ($1, $2, $3, $4) RETURNING id, nome, cliente_id, secretaria_id",
        [dados.name, dados.phone, clienteId, secretariaId],
      )
    )[0]!;
    const conversa = await abrirOuRetomarConversa(c);
    const sessionToken = await abrirSessao(conversa.id as string);
    return reply.code(201).send({ sessionId: conversa.id, sessionToken, contact: await contato(conversa) });
  });

  // ---------- Mensagens ----------

  app.get<{ Params: { sessionId: string }; Querystring: { after?: string } }>("/chat/sessions/:sessionId/messages", async (req) => {
    const conversa = await sessao(req);
    const { after } = validar(z.object({ after: z.string().optional() }), req.query);
    const ref = after && UUID.test(after) ? (await db.consultar("SELECT criada_em, id FROM mensagens WHERE id = $1 AND conversa_id = $2", [after, conversa.id]))[0] : undefined;
    const linhas = ref
      ? await db.consultar("SELECT * FROM mensagens WHERE conversa_id = $1 AND (criada_em, id) > ($2::timestamptz, $3::uuid) ORDER BY criada_em, id", [conversa.id, ref.criada_em, ref.id])
      : await db.consultar("SELECT * FROM mensagens WHERE conversa_id = $1 ORDER BY criada_em, id", [conversa.id]);
    return linhas.map(paraMensagem);
  });

  async function anexosDaMensagem(conversaId: string, ids: string[]): Promise<Linha[]> {
    if (ids.length === 0) return [];
    if (ids.some((i) => !UUID.test(i))) throw new ErroApi(400, "VALIDATION_ERROR", "Anexo inválido", { attachmentIds: "id inválido" });
    const r = await db.consultar("SELECT * FROM anexos WHERE conversa_id = $1 AND id = ANY($2::uuid[])", [conversaId, ids]);
    if (r.length !== new Set(ids).size) throw new ErroApi(400, "VALIDATION_ERROR", "Anexo não encontrado nesta conversa", { attachmentIds: "id inexistente" });
    return r;
  }

  async function textoDoAnexo(a: Linha): Promise<string | undefined> {
    const ext = extname(a.nome as string).slice(1).toLowerCase();
    if (ext !== "txt" && ext !== "csv") return undefined;
    return (await readFile(join(uploadDir, a.caminho as string), "utf8").catch(() => "")).slice(0, MAX_TEXTO_ANEXO) || undefined;
  }

  app.post<{ Params: { sessionId: string } }>("/chat/sessions/:sessionId/messages", async (req) => {
    const conversa = await sessao(req);
    const conversaId = conversa.id as string;
    const corpo = validar(NovaMensagem, req.body);
    const texto = corpo.text.trim();
    if (!texto && corpo.attachmentIds.length === 0) throw new ErroApi(400, "VALIDATION_ERROR", "Envie um texto ou um anexo", { text: "obrigatório" });
    if (!agente) throw new ErroApi(503, "AGENT_UNAVAILABLE", "O agente não está configurado");

    return exclusivo(conversaId, async () => {
      const anexos = await anexosDaMensagem(conversaId, corpo.attachmentIds);
      const userMessage = await gravarMensagem(db, conversaId, "user", "text", texto, anexos.length ? { attachments: anexos.map((a) => paraAnexo(a, prefixo)) } : null);

      const historico = (await db.consultar("SELECT papel, tipo, texto FROM mensagens WHERE conversa_id = $1 AND papel <> 'system' ORDER BY criada_em, id", [conversaId]))
        .filter((m) => m.texto)
        .map((m): MensagemAgente => ({ role: m.papel === "user" ? "employee" : "assistant", content: m.texto as string }));
      const aberto = await formularioAberto(db, conversaId);
      const ctx = await contato(conversa);
      const anexosAgente: AnexoAgente[] = await Promise.all(
        anexos.map(async (a) => ({ id: a.id as string, name: a.nome as string, mime_type: a.mime as string, text: await textoDoAnexo(a) })),
      );

      let r;
      try {
        r = await agente.turno({
          session_id: conversaId,
          dominio: dominioDaSecretaria(base, ctx.secretariat.name),
          municipio: ctx.municipality.name,
          form: aberto ? paraFormulario(aberto) : null,
          messages: historico,
          ...(anexosAgente.length ? { attachments: anexosAgente } : {}),
        });
      } catch (e) {
        if (e instanceof ErroAgente) {
          const timeout = e.tipo === "timeout";
          throw new ErroApi(timeout ? 504 : 502, timeout ? "AGENT_TIMEOUT" : "AGENT_UNAVAILABLE", `${e.message}. Tente enviar de novo.`);
        }
        throw e;
      }

      const agentMessage = await db.transacao(async (tx) => {
        const t = agora();
        const pronto = r.pronto_para_revisao && r.form !== null;
        const form = r.form && { ...r.form, pendencias: r.pendencias.length ? r.pendencias : r.form.pendencias, atualizadoEm: t.toISOString() };
        const linha = form ? await salvarRevisao(tx, conversaId, form, pronto ? "em_revisao" : "rascunho") : undefined;
        const msg = await gravarMensagem(tx, conversaId, "agent", pronto ? "form" : "text", r.assistant_reply, pronto ? { formularioId: linha!.id } : null);
        if (form && linha) {
          await sincronizarProcesso(tx, { conversaId, formularioId: linha.id as string, form, alvo: pronto ? "awaiting_confirmation" : "collecting", mensagemId: msg.id, agora: t });
        }
        await tx.consultar("UPDATE conversas SET status = $1 WHERE id = $2", [pronto ? "waiting_confirmation" : "active", conversaId]);
        return msg;
      });
      return { userMessage, agentMessage };
    });
  });

  // ---------- Formulário ----------

  async function formularioDaSessao(conversaId: string, formId: string): Promise<Linha> {
    const r = UUID.test(formId) ? (await db.consultar("SELECT * FROM formularios WHERE id = $1 AND conversa_id = $2", [formId, conversaId]))[0] : undefined;
    if (!r) throw new ErroApi(404, "NOT_FOUND", "Formulário não encontrado");
    return r;
  }

  app.get<{ Params: { sessionId: string; formId: string } }>("/chat/sessions/:sessionId/forms/:formId", async (req) => {
    const conversa = await sessao(req);
    return paraFormulario(await formularioDaSessao(conversa.id as string, req.params.formId));
  });

  app.post<{ Params: { sessionId: string; formId: string } }>("/chat/sessions/:sessionId/forms/:formId/submit", async (req) => {
    const conversa = await sessao(req);
    const conversaId = conversa.id as string;
    const edits = validar(z.object({ orgao: z.unknown(), processo: z.unknown() }), req.body);

    return exclusivo(conversaId, async () => {
      const linha = await formularioDaSessao(conversaId, req.params.formId);
      if (linha.status === "confirmado") throw new ErroApi(409, "CONFLICT", "Este formulário já foi confirmado");
      const t = agora();

      const r = FormularioImplantacao.safeParse({ ...paraFormulario(linha), orgao: edits.orgao, processo: edits.processo, status: "confirmado", atualizadoEm: t.toISOString() });
      if (!r.success) throw new ErroApi(422, "VALIDATION_ERROR", "Formulário inválido", detalhes(r.error));
      const form = { ...r.data, pendencias: lacunas(r.data) };

      return db.transacao(async (tx) => {
        const atualizado = (
          await tx.consultar("UPDATE formularios SET dados = $1::jsonb, status = 'confirmado', confirmado_em = $2, revisao = revisao + 1 WHERE id = $3 RETURNING *", [
            JSON.stringify(form), t.toISOString(), linha.id,
          ])
        )[0]!;
        const agentMessage = await gravarMensagem(
          tx, conversaId, "agent", "text",
          `Recebi! Enviei o formulário **${form.processo.nome}** para o time de implantação. Se quiser configurar outro processo, é só me dizer qual.`,
        );
        await sincronizarProcesso(tx, { conversaId, formularioId: linha.id as string, form, alvo: "confirmed", mensagemId: agentMessage.id, agora: t });
        await tx.consultar("UPDATE conversas SET status = 'active' WHERE id = $1", [conversaId]);
        return { formulario: paraFormulario(atualizado), agentMessage };
      });
    });
  });

  // ---------- Anexos ----------

  app.post<{ Params: { sessionId: string } }>("/chat/sessions/:sessionId/attachments", async (req, reply) => {
    const conversa = await sessao(req);
    const arquivo = await req.file();
    if (!arquivo) throw new ErroApi(400, "VALIDATION_ERROR", "Envie o arquivo no campo \"file\"", { file: "obrigatório" });
    const ext = extname(arquivo.filename).slice(1).toLowerCase();
    if (!TIPOS_ANEXO.has(ext)) throw new ErroApi(415, "UNSUPPORTED_TYPE", `Tipo não aceito. Use: ${[...TIPOS_ANEXO].join(", ")}`);
    const buffer = await arquivo.toBuffer();
    if (arquivo.file.truncated) throw new ErroApi(413, "FILE_TOO_LARGE", "Arquivo acima do limite de 10 MB");

    await mkdir(uploadDir, { recursive: true });
    const caminho = `${randomUUID()}.${ext}`;
    await writeFile(join(uploadDir, caminho), buffer);
    const a = (
      await db.consultar("INSERT INTO anexos (conversa_id, nome, mime, tamanho, caminho) VALUES ($1, $2, $3, $4, $5) RETURNING *", [
        conversa.id, arquivo.filename, arquivo.mimetype, buffer.length, caminho,
      ])
    )[0]!;
    return reply.code(201).send(paraAnexo(a, prefixo));
  });

  /** Serve o arquivo com o token da sessão dona da conversa ou com o JWT de quem enxerga a prefeitura. */
  app.get<{ Params: { id: string } }>("/files/:id", async (req, reply) => {
    const a = UUID.test(req.params.id)
      ? (await db.consultar("SELECT a.*, cv.token_sessao_hash, cv.cliente_id FROM anexos a JOIN conversas cv ON cv.id = a.conversa_id WHERE a.id = $1", [req.params.id]))[0]
      : undefined;
    if (!a) throw new ErroApi(404, "NOT_FOUND", "Arquivo não encontrado");

    const token = req.headers["x-session-token"];
    let permitido = typeof token === "string" && !!a.token_sessao_hash && iguais(hashToken(token), a.token_sessao_hash as string);
    if (!permitido) {
      const [tipo, jwt] = (req.headers.authorization ?? "").split(" ");
      const uid = tipo === "Bearer" && jwt ? verificarToken(jwt, segredoJwt, agora()) : undefined;
      const u = uid ? await buscarUsuario(db, uid) : undefined;
      permitido = !!u && (await clientesNoEscopo(db, u)).includes(a.cliente_id as string);
    }
    if (!permitido) throw naoAutorizada();

    const conteudo = await readFile(join(uploadDir, a.caminho as string)).catch(() => undefined);
    if (!conteudo) throw new ErroApi(404, "NOT_FOUND", "Arquivo não encontrado");
    return reply
      .header("content-type", a.mime as string)
      .header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(a.nome as string)}`)
      .send(conteudo);
  });
}
