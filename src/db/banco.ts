import pg from "pg";

export type Linha = Record<string, unknown>;

/**
 * Acesso ao PostgreSQL (Supabase). Parâmetros posicionais $1, $2...
 * Implementado sobre node-postgres; nos testes, sobre PGlite (Postgres embutido).
 */
export interface Banco {
  consultar<T = Linha>(sql: string, parametros?: unknown[]): Promise<T[]>;
  /** Vários comandos de uma vez, sem parâmetros (ex.: migrations). */
  executar(sql: string): Promise<void>;
  /** Executa fn numa transação; desfaz tudo se lançar. Dentro dela, transacao reaproveita a mesma. */
  transacao<T>(fn: (tx: Banco) => Promise<T>): Promise<T>;
  fechar(): Promise<void>;
}

const paraIso = (v: string) => new Date(v).toISOString();

/**
 * Conversões de tipo comuns aos dois drivers: datas viram ISO 8601 UTC (formato do contrato)
 * e bigint/numeric (COUNT, AVG) viram number — os valores do dashboard cabem com folga.
 */
export const CONVERSORES: Record<number, (v: string) => unknown> = {
  20: Number, // int8
  1700: Number, // numeric
  1114: (v) => paraIso(`${v}Z`), // timestamp (sem fuso, tratado como UTC)
  1184: paraIso, // timestamptz
};

type Executor = { query: (sql: string, parametros?: unknown[]) => Promise<{ rows: unknown[] }> };

function sobre(executor: Executor, transacao: Banco["transacao"], fechar: Banco["fechar"]): Banco {
  return {
    consultar: async <T>(sql: string, parametros: unknown[] = []) => (await executor.query(sql, parametros)).rows as T[],
    // sem parâmetros o node-postgres usa o protocolo simples, que aceita vários comandos
    executar: async (sql) => void (await executor.query(sql)),
    transacao,
    fechar,
  };
}

export interface OpcoesPostgres {
  /** connection string do Supabase (Settings → Database). */
  url: string;
  /** SSL ligado por padrão fora de localhost (o Supabase exige). */
  ssl?: boolean;
  max?: number;
}

export function conectarPostgres({ url, ssl, max = 10 }: OpcoesPostgres): Banco {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max,
    // o certificado do pooler do Supabase não está na cadeia padrão do Node
    ssl: (ssl ?? !local) ? { rejectUnauthorized: false } : undefined,
    types: { getTypeParser: ((oid: number, formato?: string) => CONVERSORES[oid] ?? pg.types.getTypeParser(oid, formato as "text")) as typeof pg.types.getTypeParser },
  });

  const banco: Banco = sobre(
    pool,
    async (fn) => {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        const tx: Banco = sobre(cliente, (f) => f(tx), async () => {});
        const r = await fn(tx);
        await cliente.query("COMMIT");
        return r;
      } catch (e) {
        await cliente.query("ROLLBACK");
        throw e;
      } finally {
        cliente.release();
      }
    },
    () => pool.end(),
  );
  return banco;
}

/**
 * Insere muitas linhas num único comando (jsonb_to_recordset), para não fazer uma ida ao banco por linha.
 * `colunas` mapeia nome → tipo SQL (ex.: { id: "uuid", status: "public.status_processo" }).
 */
export async function inserirEmLote(db: Banco, tabela: string, colunas: Record<string, string>, linhas: Linha[], lote = 1000) {
  const nomes = Object.keys(colunas);
  const definicao = nomes.map((n) => `${n} ${colunas[n]}`).join(", ");
  for (let i = 0; i < linhas.length; i += lote) {
    await db.consultar(
      `INSERT INTO ${tabela} (${nomes.join(", ")}) SELECT ${nomes.join(", ")} FROM jsonb_to_recordset($1::jsonb) AS x(${definicao})`,
      [JSON.stringify(linhas.slice(i, i + lote))],
    );
  }
}
