import { bancoDoAmbiente } from "../src/db/conexao.js";
import { migrar } from "../src/db/migracoes.js";

const db = bancoDoAmbiente();
try {
  const novas = await migrar(db);
  console.log(novas.length ? `Aplicadas: ${novas.join(", ")}` : "Banco já está em dia.");
} finally {
  await db.fechar();
}
