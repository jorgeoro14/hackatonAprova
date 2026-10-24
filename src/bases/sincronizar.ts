import type { Banco } from "../db/banco.js";
import type { BaseConhecimento } from "../knowledge/loader.js";

const RELEVANCIA = "## Relevância para a implantação";
const TEXTO = "## Texto integral";

/** Separa o markdown de uma norma nas duas seções que interessam ao banco. */
export function secoesDaNorma(conteudo: string): { relevancia: string; texto: string } {
  const i = conteudo.indexOf(RELEVANCIA);
  const j = conteudo.indexOf(TEXTO);
  const relevancia = i < 0 ? "" : conteudo.slice(i + RELEVANCIA.length, j > i ? j : undefined).trim();
  const texto = j < 0 ? "" : conteudo.slice(j + TEXTO.length).trim();
  return { relevancia, texto };
}

export interface ResultadoSincronia {
  bases: number;
  normas: number;
  /** bases que sumiram do knowledge/ mas continuam em uso por algum agente */
  indisponiveis: string[];
}

/**
 * Espelha knowledge/dominios nas tabelas bases_normas e normas, numa transação.
 * Base que sumiu do knowledge/ é apagada se nenhum agente a usa; senão fica marcada como indisponível.
 */
export async function sincronizarBases(db: Banco, base: BaseConhecimento, agora = new Date()): Promise<ResultadoSincronia> {
  const dominios = [...base.dominios.values()];
  const bases = dominios.map(({ dominio, guia }) => ({
    id: dominio.id,
    nome: dominio.nome,
    descricao: dominio.descricao,
    maturidade: dominio.maturidade,
    transversal: dominio.transversal,
    processos_cobertos: dominio.processosCobertos,
    guia: guia?.conteudo ?? null,
  }));
  const normas = dominios.flatMap(({ dominio, legislacao }) =>
    legislacao.map(({ meta, conteudo }) => ({
      base_id: dominio.id,
      id: meta.id,
      titulo: meta.titulo,
      tipo: meta.tipo,
      numero: meta.numero,
      ano: meta.ano,
      esfera: meta.esfera,
      ementa: meta.ementa ?? null,
      url: meta.url ?? null,
      abrangencia: meta.abrangencia ?? null,
      tags: meta.tags,
      ...secoesDaNorma(conteudo),
    })),
  );

  return db.transacao(async (tx) => {
    await tx.consultar(
      `INSERT INTO public.bases_normas (id, nome, descricao, maturidade, transversal, processos_cobertos, guia, disponivel, sincronizada_em)
       SELECT x.id, x.nome, x.descricao, x.maturidade::public.maturidade_base, x.transversal,
              ARRAY(SELECT jsonb_array_elements_text(x.processos_cobertos)), x.guia, true, $2
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, nome text, descricao text, maturidade text, transversal boolean,
                                               processos_cobertos jsonb, guia text)
       ON CONFLICT (id) DO UPDATE SET nome = excluded.nome, descricao = excluded.descricao, maturidade = excluded.maturidade,
         transversal = excluded.transversal, processos_cobertos = excluded.processos_cobertos, guia = excluded.guia,
         disponivel = true, sincronizada_em = excluded.sincronizada_em`,
      [JSON.stringify(bases), agora.toISOString()],
    );

    const ids = bases.map((b) => b.id);
    await tx.consultar("DELETE FROM public.normas WHERE base_id = ANY($1::text[])", [ids]);
    if (normas.length > 0) {
      await tx.consultar(
        `INSERT INTO public.normas (base_id, id, titulo, tipo, numero, ano, esfera, ementa, url, abrangencia, tags, relevancia, texto)
         SELECT x.base_id, x.id, x.titulo, x.tipo, x.numero, x.ano, x.esfera, x.ementa, x.url, x.abrangencia,
                ARRAY(SELECT jsonb_array_elements_text(x.tags)), x.relevancia, x.texto
         FROM jsonb_to_recordset($1::jsonb) AS x(base_id text, id text, titulo text, tipo text, numero text, ano integer,
                                                 esfera text, ementa text, url text, abrangencia text, tags jsonb,
                                                 relevancia text, texto text)`,
        [JSON.stringify(normas)],
      );
    }

    // bases que saíram do knowledge/: some do catálogo, mas não quebra agente que já a usa
    const indisponiveis = await tx.consultar<{ id: string }>(
      `UPDATE public.bases_normas b SET disponivel = false
       WHERE NOT (b.id = ANY($1::text[])) AND EXISTS (SELECT 1 FROM public.agente_bases ab WHERE ab.base_id = b.id)
       RETURNING b.id`,
      [ids],
    );
    await tx.consultar(
      `DELETE FROM public.bases_normas b
       WHERE NOT (b.id = ANY($1::text[])) AND NOT EXISTS (SELECT 1 FROM public.agente_bases ab WHERE ab.base_id = b.id)`,
      [ids],
    );

    return { bases: bases.length, normas: normas.length, indisponiveis: indisponiveis.map((r) => r.id) };
  });
}
