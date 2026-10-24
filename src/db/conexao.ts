import { env } from "../config/env.js";
import { conectarPostgres, type Banco } from "./banco.js";

/** Banco configurado em DATABASE_URL; falha com mensagem clara se não houver. */
export function bancoDoAmbiente(): Banco {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL não definida. No Supabase: Connect → Session pooler → copie a URI para o .env (veja .env.example).",
    );
  }
  return conectarPostgres({ url: env.DATABASE_URL });
}
