import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Banco } from "../db/banco.js";
import { tratarErros } from "../api/erros.js";
import { conferirSenha, emitirToken, verificarToken, type Usuario } from "./auth.js";
import { METRICAS_SERIE, resumoMetricas, serieMetrica, type Periodo } from "./metricas.js";
import {
  buscarUsuario,
  buscarUsuarioPorUsername,
  clientesNoEscopo,
  detalheCliente,
  detalheFormulario,
  detalheConversa,
  detalheProcesso,
  ErroApi,
  exigirCliente,
  formularioDoProcesso,
  listarImplantadores,
  listarReunioes,
  paginaClientes,
  paginaConversas,
  paginaProcessos,
  registrarReuniao,
} from "./repositorio.js";

export interface OpcoesDashboard {
  db: Banco;
  segredoJwt: string;
  validadeTokenMinutos?: number;
  /** Relógio injetável para testes */
  agora?: () => Date;
}

const DIA = 24 * 60 * 60 * 1000;
const PERIODO_PADRAO_DIAS = 90;

/** Aceita "2026-10-24" ou ISO completo. */
const Data = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "data inválida");
const soData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const FiltroMetricas = z.object({
  from: Data.optional(),
  to: Data.optional(),
  implementerId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
});

const Paginacao = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

const Login = z.object({ username: z.string().min(1), password: z.string().min(1) });

const NovaReuniao = z.object({
  date: Data,
  durationMinutes: z.number().int().positive().max(24 * 60),
  notes: z.string().max(5000).optional(),
});

/** Converte from/to da query para [de, ate). "to" só com data inclui o dia inteiro. */
function periodo(q: { from?: string; to?: string }, agora: Date): Periodo {
  const ate = q.to ? new Date(Date.parse(q.to) + (soData(q.to) ? DIA : 0)) : agora;
  const de = q.from ? new Date(q.from) : new Date(ate.getTime() - PERIODO_PADRAO_DIAS * DIA);
  if (de >= ate) throw new ErroApi(400, "VALIDATION_ERROR", "from deve ser anterior a to");
  return { de, ate };
}

function validar<T>(schema: z.ZodType<T>, dados: unknown): T {
  const r = schema.safeParse(dados ?? {});
  if (r.success) return r.data;
  const details = Object.fromEntries(r.error.issues.map((i) => [i.path.join(".") || "_", i.message]));
  throw new ErroApi(400, "VALIDATION_ERROR", "Parâmetros inválidos", details);
}

/** Rotas do dashboard (JWT). Registrar com prefixo /api/v1. */
export async function rotasDashboard(app: FastifyInstance, opcoes: OpcoesDashboard) {
  const { db, segredoJwt, validadeTokenMinutos = 8 * 60 } = opcoes;
  const agora = opcoes.agora ?? (() => new Date());

  tratarErros(app);

  async function usuario(req: FastifyRequest): Promise<Usuario> {
    const [tipo, token] = (req.headers.authorization ?? "").split(" ");
    const id = tipo === "Bearer" && token ? verificarToken(token, segredoJwt, agora()) : undefined;
    const u = id && (await buscarUsuario(db, id));
    if (!u) throw new ErroApi(401, "UNAUTHORIZED", "Token ausente, inválido ou expirado");
    return u;
  }

  async function head(req: FastifyRequest): Promise<Usuario> {
    const u = await usuario(req);
    if (u.role !== "head") throw new ErroApi(403, "FORBIDDEN", "Apenas a head de implantação");
    return u;
  }

  // ---------- Auth ----------

  app.post("/auth/login", async (req) => {
    const { username, password } = validar(Login, req.body);
    const achado = await buscarUsuarioPorUsername(db, username);
    if (!achado || !conferirSenha(password, achado.senhaHash)) {
      throw new ErroApi(401, "INVALID_CREDENTIALS", "Usuário ou senha inválidos");
    }
    return { ...emitirToken(achado.usuario, segredoJwt, validadeTokenMinutos, agora()), user: achado.usuario };
  });

  app.get("/auth/me", async (req) => usuario(req));

  // JWT sem estado: o front descarta o token
  app.post("/auth/logout", async (req, reply) => {
    await usuario(req);
    return reply.code(204).send();
  });

  // ---------- Métricas ----------

  app.get("/metrics/summary", async (req) => {
    const q = validar(FiltroMetricas, req.query);
    const clientes = await clientesNoEscopo(db, await usuario(req), q);
    return resumoMetricas(db, clientes, periodo(q, agora()));
  });

  app.get("/metrics/timeseries", async (req) => {
    const q = validar(
      FiltroMetricas.extend({ metric: z.enum(METRICAS_SERIE), granularity: z.enum(["day", "week"]).default("day") }),
      req.query,
    );
    const clientes = await clientesNoEscopo(db, await usuario(req), q);
    return { metric: q.metric, points: await serieMetrica(db, clientes, q.metric, periodo(q, agora()), q.granularity) };
  });

  // ---------- Clientes ----------

  app.get("/clients", async (req) => {
    const q = validar(
      Paginacao.extend({
        implementerId: z.string().min(1).optional(),
        status: z.enum(["onboarding", "in_progress", "completed", "at_risk"]).optional(),
        q: z.string().optional(),
      }),
      req.query,
    );
    const ids = await clientesNoEscopo(db, await usuario(req), { implementerId: q.implementerId });
    return paginaClientes(db, ids, agora(), q, q);
  });

  app.get<{ Params: { id: string } }>("/clients/:id", async (req) => {
    await exigirCliente(db, await usuario(req), req.params.id);
    return detalheCliente(db, req.params.id, agora());
  });

  app.get<{ Params: { id: string } }>("/clients/:id/processes", async (req) => {
    await exigirCliente(db, await usuario(req), req.params.id);
    const q = validar(
      Paginacao.extend({
        secretariat: z.string().optional(),
        status: z.enum(["not_started", "collecting", "awaiting_confirmation", "confirmed", "sent_to_dev", "validated"]).optional(),
        q: z.string().optional(),
      }),
      req.query,
    );
    return paginaProcessos(db, req.params.id, q, q);
  });

  app.get<{ Params: { id: string } }>("/clients/:id/conversations", async (req) => {
    await exigirCliente(db, await usuario(req), req.params.id);
    return paginaConversas(db, req.params.id, validar(Paginacao, req.query));
  });

  app.get<{ Params: { clientId: string } }>("/clients/:clientId/meetings", async (req) => {
    await exigirCliente(db, await usuario(req), req.params.clientId);
    return listarReunioes(db, req.params.clientId);
  });

  app.post<{ Params: { clientId: string } }>("/clients/:clientId/meetings", async (req, reply) => {
    const u = await usuario(req);
    await exigirCliente(db, u, req.params.clientId);
    const dados = validar(NovaReuniao, req.body);
    return reply.code(201).send(await registrarReuniao(db, req.params.clientId, dados, u.id, agora()));
  });

  app.get<{ Params: { id: string } }>("/processes/:id", async (req) => detalheProcesso(db, await usuario(req), req.params.id));

  app.get<{ Params: { id: string } }>("/processes/:id/form", async (req) => formularioDoProcesso(db, await usuario(req), req.params.id));

  app.get<{ Params: { id: string } }>("/forms/:id", async (req) => detalheFormulario(db, await usuario(req), req.params.id));

  app.get<{ Params: { id: string } }>("/conversations/:id", async (req) => detalheConversa(db, await usuario(req), req.params.id));

  // ---------- Time (head) ----------

  app.get("/implementers", async (req) => {
    await head(req);
    return (await listarImplantadores(db, agora())).map(({ clientes: _, ...resumo }) => resumo);
  });

  app.get<{ Params: { id: string } }>("/implementers/:id", async (req) => {
    await head(req);
    const [imp] = await listarImplantadores(db, agora(), req.params.id);
    if (!imp) throw new ErroApi(404, "NOT_FOUND", "Implantador não encontrado");
    const { clientes, ...resumo } = imp;
    return { ...resumo, clients: clientes };
  });
}
