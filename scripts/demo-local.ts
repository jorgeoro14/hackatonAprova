import { agenteFalso } from "../test/apoio/agente-falso.js";
import { bancoDeTeste } from "../test/apoio/pglite.js";
import { clienteAgenteHttp } from "../src/agente/cliente.js";
import { criarApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { modeloDeDemo, semearDemo } from "../src/db/seed.js";
import { carregarBase } from "../src/knowledge/loader.js";

/**
 * Sobe o back inteiro sem Supabase: Postgres em memória (PGlite) com os dados de demo.
 * Por padrão o agente é o falso dos testes (formulário do processo-modelo na 2ª mensagem).
 * Com DEMO_AGENTE_REAL=1, usa o serviço de verdade em AGENT_URL.
 *
 *   npm run demo:local
 *   DEMO_AGENTE_REAL=1 AGENT_URL=http://localhost:8000 npm run demo:local
 */
const base = await carregarBase(env.KNOWLEDGE_DIR);
const modelo = modeloDeDemo(base);
if (!modelo) throw new Error("A base não tem nenhum processo-modelo para a demo");

const db = await bancoDeTeste();
await semearDemo(db, { senha: env.SEED_SENHA, modelo });

const real = process.env.DEMO_AGENTE_REAL === "1";
const app = criarApp(base, {
  agente: real ? clienteAgenteHttp(env.AGENT_URL, { timeoutMs: env.AGENT_TIMEOUT_MS }) : agenteFalso(modelo).agente,
  uploadDir: env.UPLOAD_DIR,
  dashboard: { db, segredoJwt: env.JWT_SECRET, validadeTokenMinutos: env.JWT_VALIDADE_MINUTOS },
  origensCors: env.CORS_ORIGINS,
});
await app.listen({ port: env.PORT, host: "0.0.0.0" });
console.log(`Back de demo em http://localhost:${env.PORT}/api/v1 (banco em memória; agente ${real ? `real em ${env.AGENT_URL}` : "falso"})`);
console.log(`Logins: head, maria.silva, joao.pereira, ana.costa — senha ${env.SEED_SENHA}`);
console.log("Telefone conhecido: (51) 99000-0000 · qualquer outro cai no cadastro");
