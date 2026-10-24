/**
 * Premissas das métricas do dashboard: como seria a implantação no modelo manual (por reunião).
 * São estimativas iniciais para comparação. Fórmulas em docs/metricas-dashboard.md.
 *
 * > TODO: calibrar com dados históricos reais de implantações da Aprova.
 */

/** Reuniões que o modelo manual faz por secretaria atendida: levantamento, validação do form clonado e ajustes. */
export const REUNIOES_MANUAIS_POR_SECRETARIA = 3;

/** Tempo médio do 1º contato ao fluxo validado no modelo manual: 10 dias corridos. */
export const MINUTOS_FLUXO_MANUAL = 10 * 24 * 60;

/**
 * Minutos que o implantador gastaria para levantar e registrar, manualmente, um item de cada categoria.
 * Horas economizadas = Σ itens coletados pelo agente × minutos da categoria.
 */
export const MINUTOS_MANUAIS_POR_CATEGORIA = {
  documento: 10,
  prazo: 10,
  taxa: 20,
  etapa: 30,
  setor: 15,
  despacho: 20,
  campo_formulario: 5,
  base_legal: 15,
  outro: 10,
} as const satisfies Record<string, number>;

export type CategoriaCampo = keyof typeof MINUTOS_MANUAIS_POR_CATEGORIA;

export const CATEGORIAS = Object.keys(MINUTOS_MANUAIS_POR_CATEGORIA) as CategoriaCampo[];

export function minutosManuais(categoria: string): number {
  return MINUTOS_MANUAIS_POR_CATEGORIA[categoria as CategoriaCampo] ?? MINUTOS_MANUAIS_POR_CATEGORIA.outro;
}

/**
 * Cliente "em risco": o progresso real está mais de N pontos percentuais abaixo do esperado
 * para o tempo decorrido (linear entre início e meta), ou a meta já passou sem concluir.
 */
export const TOLERANCIA_ATRASO_PP = 20;

/** Status em que a regra do processo está completa (coletada e confirmada pela prefeitura). */
export const STATUS_COMPLETOS = ["confirmed", "sent_to_dev", "validated"] as const;
