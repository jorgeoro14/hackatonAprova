import { resolve } from "node:path";
import { carregarBase, KnowledgeError } from "../src/knowledge/loader.js";

const raiz = resolve(process.argv[2] ?? "knowledge");

try {
  const base = await carregarBase(raiz);
  console.log(`✔ Base válida (${raiz})`);
  console.log(`  sistema: ${base.sistema.length} documento(s)`);
  for (const { dominio, guia, legislacao, processos } of base.dominios.values()) {
    const extras = [dominio.maturidade, dominio.transversal ? "transversal" : "", guia ? "com guia" : ""].filter(Boolean);
    console.log(`  ${dominio.id}: ${legislacao.length} norma(s), ${processos.length} processo(s) [${extras.join(", ")}]`);
  }
} catch (e) {
  if (e instanceof KnowledgeError) {
    console.error(`✘ ${e.message}`);
    process.exit(1);
  }
  throw e;
}
