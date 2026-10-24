import { z } from "zod";

const kebabId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id deve ser kebab-case");
const campoId = z.string().regex(/^[a-z0-9_]+$/, "id de campo deve ser snake_case");

// ---------- Camada 1: sistema ----------

export const SistemaFrontmatter = z.object({
  id: kebabId,
  titulo: z.string().min(1),
  tags: z.array(z.string()).default([]),
  /** páginas de onde o conteúdo foi tirado (site, central de ajuda, telas) */
  fontes: z.array(z.url()).default([]),
});

// ---------- Camada 2: legislação ----------

export const LegislacaoFrontmatter = z.object({
  id: kebabId,
  titulo: z.string().min(1),
  esfera: z.enum(["federal", "estadual", "municipal"]),
  tipo: z.enum(["constituicao", "lei", "lei-complementar", "decreto", "resolucao", "portaria", "instrucao-normativa", "deliberacao", "outro"]),
  numero: z.string(),
  ano: z.number().int(),
  orgao: z.string().optional(),
  uf: z.string().length(2).optional(),
  municipio: z.string().optional(),
  /** publicação oficial */
  url: z.url().optional(),
  ementa: z.string().optional(),
  /** "trecho" quando o arquivo traz só parte da norma (ex.: capítulo da Constituição) */
  abrangencia: z.enum(["integral", "trecho", "sem-texto"]).optional(),
  /** de onde veio o texto integral e quando foi importado (scripts/importar-legislacao.ts) */
  fonteTexto: z.url().optional(),
  importadoEm: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

// ---------- Camada 3: processos ----------

export const TipoCampo = z.enum([
  "texto",
  "texto_longo",
  "numero",
  "moeda",
  "data",
  "cpf",
  "cnpj",
  "cpf_cnpj",
  "email",
  "telefone",
  "cep",
  "endereco",
  "selecao",
  "multipla_escolha",
  "sim_nao",
  "anexo",
  "coordenadas",
  /** grupo repetível (ex.: responsáveis); as colunas ficam em `campos` */
  "lista",
  /** número de outro processo já existente na Aprova (ex.: o alvará do habite-se) */
  "processo",
]);

export type Campo = {
  id: string;
  rotulo: string;
  tipo: z.infer<typeof TipoCampo>;
  obrigatorio: boolean;
  /** condição, em texto, para o campo ser obrigatório (quando `obrigatorio` é false) */
  obrigatorioSe?: string;
  /** condição, em texto, para o campo aparecer */
  visivelSe?: string;
  opcoes?: string[];
  ajuda?: string;
  /** colunas de cada linha, quando tipo = "lista" */
  campos?: Campo[];
  baseLegal?: string[];
};

export const Campo: z.ZodType<Campo> = z.lazy(() =>
  z.object({
    id: campoId,
    rotulo: z.string().min(1),
    tipo: TipoCampo,
    obrigatorio: z.boolean(),
    obrigatorioSe: z.string().optional(),
    visivelSe: z.string().optional(),
    opcoes: z.array(z.string()).optional(),
    ajuda: z.string().optional(),
    campos: z.array(Campo).optional(),
    baseLegal: z.array(kebabId).optional(),
  }),
);

export const Secao = z.object({
  titulo: z.string().min(1),
  /** orientação mostrada ao requerente ao lado da seção */
  ajuda: z.string().optional(),
  campos: z.array(Campo).min(1),
  /** mensagens de validação da seção (ex.: "Demolição não pode ser solicitada sozinha") */
  avisos: z.array(z.string()).default([]),
});

/** Cartão da aba Resumo que o servidor preenche durante a tramitação (parecer, status, observações, taxa). */
export const Cartao = z.object({
  id: campoId,
  nome: z.string().min(1),
  campos: z.array(Campo).min(1),
});

export const DocumentoExigido = z.object({
  id: campoId,
  nome: z.string().min(1),
  obrigatorio: z.boolean(),
  descricao: z.string().optional(),
  baseLegal: z.array(kebabId).optional(),
});

export const Taxa = z.object({
  nome: z.string().min(1),
  baseCalculo: z.string().optional(),
  /** etapa em que a taxa é lançada; o processo só segue após a confirmação do pagamento */
  etapa: campoId.optional(),
  baseLegal: z.array(kebabId).default([]),
});

/** Como o serviço aparece no Portal de Serviços e na aba Resumo do processo. */
export const Resumo = z.object({
  /** texto de apresentação no Portal: o que é e para que serve */
  apresentacao: z.string().min(1),
  quemPodeSolicitar: z.string().optional(),
  /** "externo": requerente abre pelo Portal; "interno": servidor abre de ofício ou em nome de alguém */
  abertura: z.array(z.enum(["externo", "interno"])).min(1).default(["externo"]),
  /** id dos campos do formulário que identificam o processo na caixa de entrada e no resumo */
  camposDestaque: z.array(campoId).default([]),
});

/** Unidade que recebe o processo numa etapa. */
export const Setor = z.object({
  id: campoId,
  nome: z.string().min(1),
  /** "requerente" = devolução ao cidadão/empresa; "automatico" = robô ou integração (ex.: confirmação de taxa) */
  tipo: z.enum(["interno", "requerente", "automatico"]).default("interno"),
});

export const TipoEtapa = z.enum([
  "protocolo",
  "triagem",
  "exigencia",
  "analise",
  "vistoria",
  "parecer",
  "audiencia",
  "decisao",
  "pagamento",
  "emissao",
  "arquivamento",
  "outro",
]);

export const Etapa = z.object({
  id: campoId,
  nome: z.string().min(1),
  tipo: TipoEtapa,
  /** id de um setor de `setores` */
  responsavel: campoId,
  prazoDias: z.number().int().positive().optional(),
  contagemPrazo: z.enum(["corridos", "uteis"]).optional(),
  /** enquanto o processo está nesta etapa, o prazo total fica suspenso (ex.: exigência ao requerente) */
  suspendePrazoTotal: z.boolean().optional(),
});

export const Transicao = z.object({
  de: campoId,
  para: campoId,
  condicao: z.string().optional(),
});

export const Fluxo = z
  .object({
    etapas: z.array(Etapa).min(1),
    transicoes: z.array(Transicao),
    prazoTotalDias: z.number().int().positive().optional(),
  })
  .superRefine((fluxo, ctx) => {
    const ids = new Set(fluxo.etapas.map((e) => e.id));
    fluxo.transicoes.forEach((t, i) => {
      for (const lado of ["de", "para"] as const) {
        if (!ids.has(t[lado])) {
          ctx.addIssue({ code: "custom", path: ["transicoes", i, lado], message: `etapa "${t[lado]}" não existe` });
        }
      }
    });
  });

export const TipoDespacho = z.enum([
  "encaminhamento",
  "exigencia",
  "parecer",
  "deferimento",
  "indeferimento",
  "ciencia",
  "arquivamento",
  "outro",
]);

/** Variáveis que a Aprova preenche sozinha nos textos de despachos e documentos. */
export const VARIAVEIS_SISTEMA = ["numero_processo", "data_protocolo", "data_atual", "sequencial", "ano", "orgao", "municipio"];

/** Modelo de despacho: ato que o servidor registra numa etapa e que, opcionalmente, move o processo. */
export const ModeloDespacho = z.object({
  id: campoId,
  nome: z.string().min(1),
  tipo: TipoDespacho,
  /** etapa em que o despacho fica disponível */
  etapa: campoId,
  /** etapa de destino; precisa existir a transição etapa → levaPara */
  levaPara: campoId.optional(),
  /** texto-base; {{variavel}} é id de campo do formulário ou uma de VARIAVEIS_SISTEMA */
  texto: z.string().optional(),
  visivelRequerente: z.boolean().default(true),
  exigeAssinatura: z.boolean().default(false),
  assinante: z.string().optional(),
  /** prazo dado ao destinatário para responder (ex.: exigência) */
  prazoRespostaDias: z.number().int().positive().optional(),
  baseLegal: z.array(kebabId).optional(),
});

export const DocumentoFinal = z.object({
  nome: z.string().min(1),
  /** padrão de numeração, ex.: "LAP {{sequencial}}/{{ano}}" */
  numeracao: z.string().optional(),
  /** etapa em que o documento é gerado */
  etapa: campoId.optional(),
  /** texto-base, com as mesmas variáveis dos despachos */
  texto: z.string().optional(),
  validadeMaximaMeses: z.number().int().positive().optional(),
  assinante: z.string().optional(),
  baseLegal: z.array(kebabId).optional(),
});

/** De onde veio o processo de referência. */
export const OrigemProcesso = z.object({
  /** "ambiente-modelo": importado do ambiente modelo da Aprova; "manual": escrito à mão */
  fonte: z.enum(["ambiente-modelo", "manual"]),
  /** id do processo (tipo de processo) no ambiente modelo */
  idExterno: z.string().optional(),
  url: z.url().optional(),
  importadoEm: z.string().optional(),
});

const variaveis = (texto = "") => [...texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1] as string);

export const ProcessoModelo = z
  .object({
    id: kebabId,
    nome: z.string().min(1),
    dominio: kebabId,
    exemplo: z.boolean().default(false),
    origem: OrigemProcesso.optional(),
    descricao: z.string().min(1),
    publicoAlvo: z.array(z.enum(["cidadao", "empresa", "servidor"])).min(1),
    baseLegal: z.array(kebabId).default([]),
    resumo: Resumo.optional(),
    formulario: z.object({ secoes: z.array(Secao).min(1) }),
    cartoes: z.array(Cartao).default([]),
    documentos: z.array(DocumentoExigido).default([]),
    taxas: z.array(Taxa).default([]),
    setores: z.array(Setor).min(1),
    fluxo: Fluxo,
    despachos: z.array(ModeloDespacho).default([]),
    documentoFinal: DocumentoFinal.optional(),
    /** o que não foi configurado ou confirmado na origem, e fatos úteis que não cabem nos outros blocos; `TODO:` = pendente */
    observacoes: z.array(z.string()).default([]),
  })
  .superRefine((p, ctx) => {
    const campos = new Set(p.formulario.secoes.flatMap((s) => s.campos.map((c) => c.id)));
    const setores = new Set(p.setores.map((s) => s.id));
    const etapas = new Set(p.fluxo.etapas.map((e) => e.id));
    const transicoes = new Set(p.fluxo.transicoes.map((t) => `${t.de}>${t.para}`));
    const erro = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const checarTexto = (texto: string | undefined, path: (string | number)[]) => {
      for (const v of variaveis(texto)) {
        if (!campos.has(v) && !VARIAVEIS_SISTEMA.includes(v)) erro(path, `variável "{{${v}}}" não é campo do formulário nem do sistema`);
      }
    };

    p.resumo?.camposDestaque.forEach((c, i) => {
      if (!campos.has(c)) erro(["resumo", "camposDestaque", i], `campo "${c}" não existe no formulário`);
    });
    p.fluxo.etapas.forEach((e, i) => {
      if (!setores.has(e.responsavel)) erro(["fluxo", "etapas", i, "responsavel"], `setor "${e.responsavel}" não existe`);
    });
    p.taxas.forEach((t, i) => {
      if (t.etapa && !etapas.has(t.etapa)) erro(["taxas", i, "etapa"], `etapa "${t.etapa}" não existe`);
    });
    p.despachos.forEach((d, i) => {
      if (!etapas.has(d.etapa)) erro(["despachos", i, "etapa"], `etapa "${d.etapa}" não existe`);
      if (d.levaPara && !transicoes.has(`${d.etapa}>${d.levaPara}`)) {
        erro(["despachos", i, "levaPara"], `não há transição "${d.etapa}" → "${d.levaPara}" no fluxo`);
      }
      checarTexto(d.texto, ["despachos", i, "texto"]);
    });
    if (p.documentoFinal) {
      const { etapa, numeracao, texto } = p.documentoFinal;
      if (etapa && !etapas.has(etapa)) erro(["documentoFinal", "etapa"], `etapa "${etapa}" não existe`);
      checarTexto(numeracao, ["documentoFinal", "numeracao"]);
      checarTexto(texto, ["documentoFinal", "texto"]);
    }
  });

export const Dominio = z.object({
  id: kebabId,
  nome: z.string().min(1),
  descricao: z.string().min(1),
  setoresTipicos: z.array(z.string()).default([]),
  /** "pronta": revisada para uso em implantação; "em-revisao": utilizável, mas sem revisão completa */
  maturidade: z.enum(["pronta", "em-revisao"]).default("em-revisao"),
  /** base transversal: entra em todo agente, além das escolhidas pelo implantador */
  transversal: z.boolean().default(false),
  /** tipos de processo que a base cobre (mostrados ao implantador na hora de escolher) */
  processosCobertos: z.array(z.string()).default([]),
});

export type SistemaFrontmatter = z.infer<typeof SistemaFrontmatter>;
export type LegislacaoFrontmatter = z.infer<typeof LegislacaoFrontmatter>;
export type ProcessoModelo = z.infer<typeof ProcessoModelo>;
export type ModeloDespacho = z.infer<typeof ModeloDespacho>;
export type Dominio = z.infer<typeof Dominio>;
