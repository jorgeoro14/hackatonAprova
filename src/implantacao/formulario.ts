import { z } from "zod";
import { ProcessoModelo } from "../knowledge/schemas.js";

/**
 * Saída do agente: o formulário de implantação de UM tipo de processo para um órgão.
 * Parte de um ProcessoModelo e registra a origem de cada decisão e o que ainda está pendente.
 */

export const OrigemInformacao = z.enum(["modelo", "servidor", "legislacao"]);

export const Orgao = z.object({
  municipio: z.string().min(1),
  uf: z.string().length(2),
  orgao: z.string().min(1),
  responsavel: z.object({
    nome: z.string().min(1),
    cargo: z.string().optional(),
    email: z.email().optional(),
  }),
});

export const Pendencia = z.object({
  /** caminho no processo, ex.: "taxas.0.baseCalculo" */
  caminho: z.string(),
  descricao: z.string().min(1),
});

export const RegistroOrigem = z.object({
  caminho: z.string(),
  origem: OrigemInformacao,
  observacao: z.string().optional(),
});

export const FormularioImplantacao = z.object({
  id: z.string(),
  status: z.enum(["rascunho", "em_revisao", "confirmado"]),
  dominio: z.string(),
  /** id do processo-modelo usado como ponto de partida */
  modeloBase: z.string().optional(),
  orgao: Orgao,
  /** leis/decretos municipais informados pelo servidor durante a conversa */
  legislacaoLocal: z.array(z.object({ titulo: z.string(), numero: z.string().optional(), url: z.url().optional() })).default([]),
  processo: ProcessoModelo,
  origens: z.array(RegistroOrigem).default([]),
  pendencias: z.array(Pendencia).default([]),
  atualizadoEm: z.iso.datetime(),
});

export type FormularioImplantacao = z.infer<typeof FormularioImplantacao>;
