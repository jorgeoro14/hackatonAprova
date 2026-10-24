import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { configureDefaultAgent } from "./defaults.js";
import type { Banco } from "../db/banco.js";
import { verificarToken, type Usuario } from "../dashboard/auth.js";
import { buscarUsuario, ErroApi } from "../dashboard/repositorio.js";
import type { BaseConhecimento } from "../knowledge/loader.js";
import { sincronizarBases } from "./sincronizar.js";
import {
  atualizarAgente,
  conhecimentoDoAgente,
  criarAgente,
  detalheAgente,
  detalheBase,
  detalheNorma,
  listarAgentes,
  listarBases,
  vincularConversa,
} from "./repositorio.js";

export interface OpcoesBases {
  db: Banco;
  segredoJwt: string;
  /** knowledge/ carregado; se tiver domínios, é espelhado no banco antes de o servidor aceitar requisições */
  base?: BaseConhecimento;
  agora?: () => Date;
}

const Status = z.enum(["draft", "active", "paused"]);

const NovoAgente = z.object({
  name: z.string().trim().min(1).max(120),
  whatsappNumber: z.string().min(1).nullish(),
  status: Status.optional(),
  normBaseIds: z.array(z.string().min(1)).min(1, "selecione ao menos uma base de normas"),
});

const AlteracaoAgente = NovoAgente.partial().refine((d) => Object.keys(d).length > 0, "nada para alterar");

const VinculoConversa = z.object({ agentId: z.string().min(1).nullable() });

function validar<T>(schema: z.ZodType<T>, dados: unknown): T {
  const r = schema.safeParse(dados ?? {});
  if (r.success) return r.data;
  const details = Object.fromEntries(r.error.issues.map((i) => [i.path.join(".") || "_", i.message]));
  throw new ErroApi(400, "VALIDATION_ERROR", "Parâmetros inválidos", details);
}

/**
 * Bases de normas e agentes de WhatsApp (JWT do dashboard). Registrar com prefixo /api/v1.
 *
 * Fluxo do implantador: GET /norm-bases (escolhe) → POST /clients/:id/agents (cria com normBaseIds)
 * → PUT /conversations/:id/agent (liga a conversa de WhatsApp ao agente).
 */
export async function rotasBases(app: FastifyInstance, opcoes: OpcoesBases) {
  const { db, segredoJwt, base } = opcoes;
  const agora = opcoes.agora ?? (() => new Date());
  if (base && base.dominios.size > 0) {
    const r = await sincronizarBases(db, base, agora());
    app.log.info(`bases de normas sincronizadas: ${r.bases} bases, ${r.normas} normas`);
    if (r.indisponiveis.length) app.log.warn(`bases fora do knowledge/ ainda usadas por agentes: ${r.indisponiveis.join(", ")}`);
  }

  app.setErrorHandler((erro, _req, reply) => {
    if (erro instanceof ErroApi) {
      return reply.code(erro.status).send({ error: { code: erro.code, message: erro.message, details: erro.details } });
    }
    const status = (erro as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: { code: "BAD_REQUEST", message: (erro as Error).message, details: {} } });
    }
    app.log.error(erro);
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Erro interno", details: {} } });
  });

  async function usuario(req: FastifyRequest): Promise<Usuario> {
    const [tipo, token] = (req.headers.authorization ?? "").split(" ");
    const id = tipo === "Bearer" && token ? verificarToken(token, segredoJwt, agora()) : undefined;
    const u = id ? await buscarUsuario(db, id) : undefined;
    if (!u) throw new ErroApi(401, "UNAUTHORIZED", "Token ausente, inválido ou expirado");
    return u;
  }

  // ---------- Catálogo de bases ----------

  app.get("/norm-bases", async (req) => {
    await usuario(req);
    return listarBases(db);
  });

  app.get<{ Params: { id: string } }>("/norm-bases/:id", async (req) => {
    await usuario(req);
    return detalheBase(db, req.params.id);
  });

  app.get<{ Params: { id: string; normId: string } }>("/norm-bases/:id/norms/:normId", async (req) => {
    await usuario(req);
    return detalheNorma(db, req.params.id, req.params.normId);
  });

  // ---------- Agentes ----------

  app.get<{ Params: { clientId: string } }>("/clients/:clientId/agents", async (req) =>
    listarAgentes(db, await usuario(req), req.params.clientId),
  );

  app.post<{ Params: { clientId: string } }>("/clients/:clientId/agents", async (req, reply) => {
    const u = await usuario(req);
    const dados = validar(NovoAgente, req.body);
    return reply.code(201).send(await criarAgente(db, u, req.params.clientId, dados));
  });

  app.get<{ Params: { id: string } }>("/agents/:id", async (req) => detalheAgente(db, await usuario(req), req.params.id));

  app.patch<{ Params: { id: string } }>("/agents/:id", async (req) => {
    const u = await usuario(req);
    return atualizarAgente(db, u, req.params.id, validar(AlteracaoAgente, req.body));
  });

  app.get<{ Params: { id: string } }>("/agents/:id/knowledge", async (req) =>
    conhecimentoDoAgente(db, await usuario(req), req.params.id),
  );

  app.put<{ Params: { clientId: string; domain: string } }>("/clients/:clientId/agent-defaults/:domain", async (req) => {
    const params = validar(z.object({ clientId: z.uuid(), domain: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/) }), req.params);
    const { agentId } = validar(z.object({ agentId: z.uuid().nullable() }), req.body);
    return configureDefaultAgent(db, await usuario(req), params.clientId, params.domain, agentId);
  });

  app.put<{ Params: { id: string } }>("/conversations/:id/agent", async (req) => {
    const u = await usuario(req);
    const { agentId } = validar(VinculoConversa, req.body);
    return vincularConversa(db, u, req.params.id, agentId);
  });
}
