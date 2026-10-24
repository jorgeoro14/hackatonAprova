import { env } from "../src/config/env.js";
import { bancoDoAmbiente } from "../src/db/conexao.js";
import { migrar } from "../src/db/migracoes.js";
import { modeloDeDemo, semearDemo } from "../src/db/seed.js";
import { carregarBase } from "../src/knowledge/loader.js";

const db = bancoDoAmbiente();
try {
  await migrar(db);
  const contagem = await semearDemo(db, { senha: env.SEED_SENHA, modelo: modeloDeDemo(await carregarBase(env.KNOWLEDGE_DIR)) });
  console.log("Dados de demo recriados:");
  for (const [tabela, n] of Object.entries(contagem)) console.log(`  ${tabela}: ${n}`);
  console.log("Usuários: head, maria.silva, joao.pereira, ana.costa (senha em SEED_SENHA)");
} finally {
  await db.fechar();
}
