import Fastify from "fastify";
import type { BaseConhecimento } from "./knowledge/loader.js";
import { buscar, indexar } from "./knowledge/search.js";

export function criarApp(base: BaseConhecimento, { logger = true } = {}) {
  const app = Fastify({ logger });

  app.get("/health", async () => ({ ok: true }));

  app.get("/sistema", async () =>
    base.sistema.map((d) => ({ id: d.meta.id, titulo: d.meta.titulo, tags: d.meta.tags })),
  );

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

  app.get<{ Querystring: { q?: string; dominio?: string; limite?: string } }>("/busca", async (req, reply) => {
    const { q, dominio, limite } = req.query;
    if (!q) return reply.code(400).send({ erro: "parâmetro q é obrigatório" });
    if (dominio && !base.dominios.has(dominio)) return reply.code(404).send({ erro: "domínio não encontrado" });
    return buscar(indexar(base, dominio), q, Number(limite) || 5);
  });

  return app;
}
