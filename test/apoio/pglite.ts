import { PGlite } from "@electric-sql/pglite";
import { CONVERSORES, type Banco } from "../../src/db/banco.js";
import { migrar } from "../../src/db/migracoes.js";

/** Postgres embutido (PGlite) com as migrations aplicadas: os testes rodam sem servidor nem Supabase. */
export async function bancoDeTeste(): Promise<Banco> {
  const pg = new PGlite({ parsers: CONVERSORES });
  type Executor = Pick<PGlite, "query" | "exec">;
  const sobre = (e: Executor, transacao: Banco["transacao"]): Banco => ({
    consultar: async <T>(sql: string, params: unknown[] = []) => (await e.query<T>(sql, params)).rows,
    executar: async (sql) => void (await e.exec(sql)),
    transacao,
    fechar: () => pg.close(),
  });
  const banco: Banco = sobre(pg, (fn) =>
    pg.transaction(async (tx) => {
      const t: Banco = sobre(tx as unknown as Executor, (f) => f(t));
      return fn(t);
    }),
  );
  await migrar(banco);
  return banco;
}

