import { AgenteImplantacao, criarMensagemAnthropic } from "./agente/agente.js";
import { SessoesEmMemoria } from "./agente/sessao.js";
import { criarApp } from "./app.js";
import { env } from "./config/env.js";
import { bancoDoAmbiente } from "./db/conexao.js";
import { migrar } from "./db/migracoes.js";
import { bancoVazio, semearDemo } from "./db/seed.js";
import { carregarBase } from "./knowledge/loader.js";

const base = await carregarBase(env.KNOWLEDGE_DIR);
const agente = new AgenteImplantacao(criarMensagemAnthropic(), base, { modelo: env.ANTHROPIC_MODEL });

const db = bancoDoAmbiente();
// aplica migrations pendentes; banco novo já sobe com os dados de demo (`npm run db:seed` recria do zero)
await migrar(db);
if (await bancoVazio(db)) await semearDemo(db, { senha: env.SEED_SENHA });

const app = criarApp(base, {
  agente,
  sessoes: new SessoesEmMemoria(),
  dashboard: { db, segredoJwt: env.JWT_SECRET, validadeTokenMinutos: env.JWT_VALIDADE_MINUTOS },
  origensCors: env.CORS_ORIGINS,
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
