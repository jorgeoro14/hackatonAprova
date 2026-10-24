import cors from "@fastify/cors";
import Fastify from "fastify";
import type { ClienteAgente } from "./agente/cliente.js";
import { rotasBases } from "./bases/rotas.js";
import { rotasChat } from "./chat/rotas.js";
import { rotasDashboard, type OpcoesDashboard } from "./dashboard/rotas.js";
import type { BaseConhecimento } from "./knowledge/loader.js";
import { buscar, CAMADAS, indexar, type OrigemTrecho } from "./knowledge/search.js";

export interface OpcoesApp {
  logger?: boolean;
  /** Serviço do agente (Python) usado pelo chat */
  agente?: ClienteAgente;
  /** Pasta dos anexos do chat */
  uploadDir?: string;
  /** Requisições/min nos endpoints públicos do chat */
  limiteChatPorMinuto?: number;
  /** Liga as rotas do dashboard em /api/v1 */
  dashboard?: OpcoesDashboard;
  /** Origens liberadas no CORS (front) */
  origensCors?: string[];
}

export function criarApp(base: BaseConhecimento, { logger = true, agente, uploadDir, limiteChatPorMinuto, dashboard, origensCors = [] }: OpcoesApp = {}) {
  const app = Fastify({ logger });

  if (origensCors.length) app.register(cors, { origin: origensCors });
  if (dashboard) {
    app.register(rotasDashboard, { ...dashboard, prefix: "/api/v1" });
    // bases de normas e agentes de WhatsApp; espelha o knowledge/ no banco ao registrar
    app.register(rotasChat, { db: dashboard.db, segredoJwt: dashboard.segredoJwt, base, agente, uploadDir, limitePorMinuto: limiteChatPorMinuto, agora: dashboard.agora, prefix: "/api/v1" });
    app.register(rotasBases, { db: dashboard.db, segredoJwt: dashboard.segredoJwt, base, agora: dashboard.agora, prefix: "/api/v1" });
  }

  app.get("/health", async () => ({ ok: true }));

  // ---------- Três portas da base: Aprova (sistema), legislação e processos de referência ----------

  app.get("/sistema", async () =>
    base.sistema.map((d) => ({ id: d.meta.id, titulo: d.meta.titulo, tags: d.meta.tags })),
  );

  app.get<{ Params: { id: string } }>("/sistema/:id", async (req, reply) => {
    const d = base.sistema.find((x) => x.meta.id === req.params.id);
    if (!d) return reply.code(404).send({ erro: "documento não encontrado" });
    return { ...d.meta, conteudo: d.conteudo };
  });

  app.get<{ Params: { id: string } }>("/dominios/:id/legislacao", async (req, reply) => {
    const d = base.dominios.get(req.params.id);
    if (!d) return reply.code(404).send({ erro: "domínio não encontrado" });
    return d.legislacao.map((l) => l.meta);
  });

  app.get<{ Params: { id: string; normaId: string } }>("/dominios/:id/legislacao/:normaId", async (req, reply) => {
    const l = base.dominios.get(req.params.id)?.legislacao.find((x) => x.meta.id === req.params.normaId);
    if (!l) return reply.code(404).send({ erro: "norma não encontrada" });
    return { ...l.meta, conteudo: l.conteudo };
  });

  app.get<{ Params: { id: string } }>("/dominios/:id/processos", async (req, reply) => {
    const d = base.dominios.get(req.params.id);
    if (!d) return reply.code(404).send({ erro: "domínio não encontrado" });
    return d.processos.map((p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, exemplo: p.exemplo }));
  });

  app.get("/dominios", async () =>
    [...base.dominios.values()].map(({ dominio, legislacao, processos }) => ({
      ...dominio,
      totalLegislacao: legislacao.length,
      totalProcessos: processos.length,
    })),
  );

  app.get<{ Params: { id: string } }>("/dominios/:id", async (req, reply) => {
    const d = base.dominios.get(req.params.id);
    if (!d) return reply.code(404).send({ erro: "domínio não encontrado" });
    return {
      ...d.dominio,
      legislacao: d.legislacao.map((l) => l.meta),
      processos: d.processos.map((p) => ({ id: p.id, nome: p.nome, exemplo: p.exemplo })),
    };
  });

  app.get<{ Params: { id: string; processoId: string } }>("/dominios/:id/processos/:processoId", async (req, reply) => {
    const p = base.dominios.get(req.params.id)?.processos.find((x) => x.id === req.params.processoId);
    if (!p) return reply.code(404).send({ erro: "processo não encontrado" });
    return p;
  });

  app.get<{ Querystring: { q?: string; dominio?: string; camada?: string; limite?: string } }>("/busca", async (req, reply) => {
    const { q, dominio, camada, limite } = req.query;
    if (!q) return reply.code(400).send({ erro: "parâmetro q é obrigatório" });
    if (camada && !CAMADAS.includes(camada as OrigemTrecho)) {
      return reply.code(400).send({ erro: `camada deve ser uma de: ${CAMADAS.join(", ")}` });
    }
    if (camada && camada !== "sistema" && !dominio) return reply.code(400).send({ erro: `camada ${camada} exige dominio` });
    if (dominio && !base.dominios.has(dominio)) return reply.code(404).send({ erro: "domínio não encontrado" });
    const trechos = indexar(base, dominio).filter((t) => !camada || t.origem === camada);
    return buscar(trechos, q, Number(limite) || 5);
  });

  return app;
}
