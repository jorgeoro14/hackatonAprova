import { createInterface } from "node:readline/promises";
import { AgenteImplantacao, criarMensagemAnthropic } from "../src/agente/agente.js";
import { montarFormulario } from "../src/agente/ferramentas.js";
import { SessoesEmMemoria } from "../src/agente/sessao.js";
import { env } from "../src/config/env.js";
import { carregarBase } from "../src/knowledge/loader.js";

// Chat de terminal para testar o agente: npm run chat -- meio-ambiente
const dominio = process.argv[2] ?? "meio-ambiente";
const base = await carregarBase(env.KNOWLEDGE_DIR);
if (!base.dominios.has(dominio)) {
  console.error(`Domínio "${dominio}" não existe. Disponíveis: ${[...base.dominios.keys()].join(", ")}`);
  process.exit(1);
}

const agente = new AgenteImplantacao(criarMensagemAnthropic(), base, { modelo: env.ANTHROPIC_MODEL });
const sessao = await new SessoesEmMemoria().criar(dominio);
const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log(`Implantação ${sessao.id} — domínio ${dominio}. Digite /formulario para ver o rascunho, /sair para encerrar.\n`);

while (true) {
  const texto = (await rl.question("servidor> ")).trim();
  if (!texto) continue;
  if (texto === "/sair") break;
  if (texto === "/formulario") {
    const r = montarFormulario(sessao);
    console.log(JSON.stringify({ valido: r.success, rascunho: sessao.rascunho }, null, 2));
    continue;
  }

  const resposta = await agente.responder(sessao, texto);
  for (const f of resposta.ferramentas) console.log(`  · ${f.nome}${f.erro ? " (erro)" : ""}`);
  console.log(`\nagente> ${resposta.texto}\n`);
}

rl.close();
