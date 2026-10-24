/** Shared backend startup for configured Postgres and isolated local development. */
import { clienteAgenteHttp } from "./agente/cliente.js";
import { criarApp } from "./app.js";
import { env } from "./config/env.js";
import type { Banco } from "./db/banco.js";
import { migrar } from "./db/migracoes.js";
import { bancoVazio, modeloDeDemo, semearDemo } from "./db/seed.js";
import { carregarBase } from "./knowledge/loader.js";

export async function startBackend(db: Banco) {
  const base = await carregarBase(env.KNOWLEDGE_DIR);
  await migrar(db);
  if (await bancoVazio(db)) await semearDemo(db, { senha: env.SEED_SENHA, modelo: modeloDeDemo(base) });
  const app = criarApp(base, {
    agente: clienteAgenteHttp(env.AGENT_URL, { timeoutMs: env.AGENT_TIMEOUT_MS }),
    uploadDir: env.UPLOAD_DIR,
    dashboard: { db, segredoJwt: env.JWT_SECRET, validadeTokenMinutos: env.JWT_VALIDADE_MINUTOS },
    origensCors: env.CORS_ORIGINS,
  });
  app.addHook("onClose", () => db.fechar());
  await app.listen({ port: env.PORT, host: "127.0.0.1" });
  return app;
}
