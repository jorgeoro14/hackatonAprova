import { clienteAgenteHttp } from "./agente/cliente.js";
import { criarApp } from "./app.js";
import { env } from "./config/env.js";
import { bancoDoAmbiente } from "./db/conexao.js";
import { migrar } from "./db/migracoes.js";
import { bancoVazio, modeloDeDemo, semearDemo } from "./db/seed.js";
import { carregarBase } from "./knowledge/loader.js";

const base = await carregarBase(env.KNOWLEDGE_DIR);
const db = bancoDoAmbiente();
// aplica migrations pendentes; banco novo já sobe com os dados de demo (`npm run db:seed` recria do zero)
await migrar(db);
if (await bancoVazio(db)) await semearDemo(db, { senha: env.SEED_SENHA, modelo: modeloDeDemo(base) });

const app = criarApp(base, {
  agente: clienteAgenteHttp(env.AGENT_URL, { timeoutMs: env.AGENT_TIMEOUT_MS }),
  uploadDir: env.UPLOAD_DIR,
  dashboard: { db, segredoJwt: env.JWT_SECRET, validadeTokenMinutos: env.JWT_VALIDADE_MINUTOS },
  origensCors: env.CORS_ORIGINS,
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
