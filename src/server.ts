import { startBackend } from "./bootstrap.js";
import { bancoDoAmbiente } from "./db/conexao.js";

await startBackend(bancoDoAmbiente());
