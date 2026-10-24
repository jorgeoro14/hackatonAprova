import { z } from "zod";

const kebabId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id deve ser kebab-case");
const campoId = z.string().regex(/^[a-z0-9_]+$/, "id de campo deve ser snake_case");

// ---------- Camada 1: sistema ----------

export const SistemaFrontmatter = z.object({
  id: kebabId,
  titulo: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

// ---------- Camada 2: legislação ----------

export const LegislacaoFrontmatter = z.object({
  id: kebabId,
  titulo: z.string().min(1),
  esfera: z.enum(["federal", "estadual", "municipal"]),
  tipo: z.enum(["lei", "lei-complementar", "decreto", "resolucao", "portaria", "instrucao-normativa", "deliberacao", "outro"]),
  numero: z.string(),
  ano: z.number().int(),
  orgao: z.string().optional(),
  uf: z.string().length(2).optional(),
  municipio: z.string().optional(),
  url: z.url().optional(),
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
]);

export const Campo = z.object({
  id: campoId,
  rotulo: z.string().min(1),
  tipo: TipoCampo,
  obrigatorio: z.boolean(),
  opcoes: z.array(z.string()).optional(),
  ajuda: z.string().optional(),
  baseLegal: z.array(kebabId).optional(),
});

export const Secao = z.object({
  titulo: z.string().min(1),
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
  baseLegal: z.array(kebabId).default([]),
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
  "emissao",
  "arquivamento",
  "outro",
]);

export const Etapa = z.object({
  id: campoId,
  nome: z.string().min(1),
  tipo: TipoEtapa,
  responsavel: z.string().min(1),
  prazoDias: z.number().int().positive().optional(),
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

export const DocumentoFinal = z.object({
  nome: z.string().min(1),
  validadeMaximaMeses: z.number().int().positive().optional(),
  assinante: z.string().optional(),
  baseLegal: z.array(kebabId).optional(),
});

export const ProcessoModelo = z.object({
  id: kebabId,
  nome: z.string().min(1),
  dominio: kebabId,
  exemplo: z.boolean().default(false),
  descricao: z.string().min(1),
  publicoAlvo: z.array(z.enum(["cidadao", "empresa", "servidor"])).min(1),
  baseLegal: z.array(kebabId).default([]),
  formulario: z.object({ secoes: z.array(Secao).min(1) }),
  documentos: z.array(DocumentoExigido).default([]),
  taxas: z.array(Taxa).default([]),
  fluxo: Fluxo,
  documentoFinal: DocumentoFinal.optional(),
});

export const Dominio = z.object({
  id: kebabId,
  nome: z.string().min(1),
  descricao: z.string().min(1),
  setoresTipicos: z.array(z.string()).default([]),
});

export type SistemaFrontmatter = z.infer<typeof SistemaFrontmatter>;
export type LegislacaoFrontmatter = z.infer<typeof LegislacaoFrontmatter>;
export type ProcessoModelo = z.infer<typeof ProcessoModelo>;
export type Dominio = z.infer<typeof Dominio>;
