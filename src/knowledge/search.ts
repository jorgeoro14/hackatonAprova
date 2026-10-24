import type { BaseConhecimento } from "./loader.js";

export type OrigemTrecho = "sistema" | "legislacao" | "processo";

export interface Trecho {
  origem: OrigemTrecho;
  /** id do documento de origem (norma, doc de sistema ou processo) */
  fonte: string;
  titulo: string;
  texto: string;
}

export interface ResultadoBusca extends Trecho {
  score: number;
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const tokenizar = (s: string) => normalizar(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2);

/** Quebra um Markdown em trechos por cabeçalho (##). */
function trechosMarkdown(conteudo: string): { titulo: string; texto: string }[] {
  const partes = conteudo.split(/^(?=##\s)/m);
  return partes
    .map((p) => {
      const [primeira = "", ...resto] = p.split("\n");
      const titulo = primeira.replace(/^#+\s*/, "").trim();
      return { titulo, texto: p.trim() };
    })
    .filter((p) => p.texto.length > 0);
}

/** Monta os trechos indexáveis: sistema + legislação e processos do domínio informado. */
export function indexar(base: BaseConhecimento, dominioId?: string): Trecho[] {
  const trechos: Trecho[] = [];

  for (const doc of base.sistema) {
    for (const t of trechosMarkdown(doc.conteudo)) {
      trechos.push({ origem: "sistema", fonte: doc.meta.id, titulo: `${doc.meta.titulo} — ${t.titulo}`, texto: t.texto });
    }
  }

  const dominio = dominioId ? base.dominios.get(dominioId) : undefined;
  if (!dominio) return trechos;

  for (const lei of dominio.legislacao) {
    for (const t of trechosMarkdown(lei.conteudo)) {
      trechos.push({ origem: "legislacao", fonte: lei.meta.id, titulo: `${lei.meta.titulo} — ${t.titulo}`, texto: t.texto });
    }
  }

  for (const p of dominio.processos) {
    trechos.push({ origem: "processo", fonte: p.id, titulo: p.nome, texto: JSON.stringify(p) });
  }

  return trechos;
}

/**
 * Busca lexical simples (sobreposição de termos). Suficiente para a base pequena atual;
 * a interface permite trocar por embeddings depois sem mudar quem chama.
 */
export function buscar(trechos: Trecho[], consulta: string, limite = 5): ResultadoBusca[] {
  const termos = new Set(tokenizar(consulta));
  if (termos.size === 0) return [];

  return trechos
    .map((t) => {
      const tokens = tokenizar(`${t.titulo} ${t.texto}`);
      const score = tokens.reduce((acc, tok) => acc + (termos.has(tok) ? 1 : 0), 0) / Math.sqrt(tokens.length || 1);
      return { ...t, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}
