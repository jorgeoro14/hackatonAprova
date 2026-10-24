import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Banco } from "./banco.js";

export const PASTA_MIGRATIONS = resolve("supabase/migrations");

/**
 * Aplica, em ordem, as migrations de supabase/migrations ainda não aplicadas.
 * Registra em supabase_migrations.schema_migrations, a mesma tabela do Supabase CLI:
 * `supabase db push` e este script enxergam o mesmo histórico.
 */
export async function migrar(db: Banco, pasta = PASTA_MIGRATIONS): Promise<string[]> {
  await db.executar(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
  `);
  const aplicadas = new Set(
    (await db.consultar<{ version: string }>("SELECT version FROM supabase_migrations.schema_migrations")).map((r) => r.version),
  );

  const arquivos = (await readdir(pasta)).filter((a) => /^\d+_.+\.sql$/.test(a)).sort();
  const novas: string[] = [];
  for (const arquivo of arquivos) {
    const [, versao, nome] = /^(\d+)_(.+)\.sql$/.exec(arquivo)!;
    if (aplicadas.has(versao!)) continue;
    const sql = await readFile(join(pasta, arquivo), "utf8");
    await db.transacao(async (tx) => {
      await tx.executar(sql);
      await tx.consultar("INSERT INTO supabase_migrations.schema_migrations (version, statements, name) VALUES ($1, $2, $3)", [
        versao,
        [sql],
        nome,
      ]);
    });
    novas.push(arquivo);
  }
  return novas;
}
