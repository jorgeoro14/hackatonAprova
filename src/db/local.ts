/** Isolated embedded Postgres for local frontend testing; never uses DATABASE_URL. */
import { PGlite } from "@electric-sql/pglite";
import { CONVERSORES, type Banco } from "./banco.js";

export function connectLocalDatabase(dataDir?: string): Banco {
  const pg = new PGlite({ dataDir, parsers: CONVERSORES });
  type Executor = Pick<PGlite, "query" | "exec">;
  const wrap = (executor: Executor, transaction: Banco["transacao"]): Banco => ({
    consultar: async <T>(sql: string, params: unknown[] = []) => (await executor.query<T>(sql, params)).rows,
    executar: async (sql) => void (await executor.exec(sql)),
    transacao: transaction,
    fechar: () => pg.close(),
  });
  return wrap(pg, (fn) => pg.transaction(async (tx) => {
    const database: Banco = wrap(tx as unknown as Executor, (nested) => nested(database));
    return fn(database);
  }));
}
