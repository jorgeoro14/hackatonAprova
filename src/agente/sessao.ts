import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { Orgao, Pendencia, RegistroOrigem } from "../implantacao/formulario.js";
import type { ProcessoModelo } from "../knowledge/schemas.js";

/**
 * Formulário em construção. Diferente do FormularioImplantacao final, aqui tudo pode estar
 * incompleto: o agente vai preenchendo durante a conversa e só valida ao concluir.
 */
export interface Rascunho {
  status: "rascunho" | "em_revisao";
  modeloBase?: string;
  orgao: Partial<z.infer<typeof Orgao>>;
  legislacaoLocal: { titulo: string; numero?: string; url?: string }[];
  processo?: ProcessoModelo;
  origens: z.infer<typeof RegistroOrigem>[];
  pendencias: z.infer<typeof Pendencia>[];
}

export interface SessaoImplantacao {
  id: string;
  dominio: string;
  /** Histórico enviado à API. Só cresce (append-only), para não invalidar cache nem thinking. */
  mensagens: Anthropic.Beta.BetaMessageParam[];
  rascunho: Rascunho;
  criadaEm: string;
  atualizadaEm: string;
}

export interface RepositorioSessoes {
  criar(dominio: string): Promise<SessaoImplantacao>;
  obter(id: string): Promise<SessaoImplantacao | undefined>;
  salvar(sessao: SessaoImplantacao): Promise<void>;
}

/** Repositório em memória. Trocar por banco quando as sessões precisarem sobreviver a reinícios. */
export class SessoesEmMemoria implements RepositorioSessoes {
  private readonly sessoes = new Map<string, SessaoImplantacao>();

  async criar(dominio: string) {
    const agora = new Date().toISOString();
    const sessao: SessaoImplantacao = {
      id: randomUUID(),
      dominio,
      mensagens: [],
      rascunho: { status: "rascunho", orgao: {}, legislacaoLocal: [], origens: [], pendencias: [] },
      criadaEm: agora,
      atualizadaEm: agora,
    };
    this.sessoes.set(sessao.id, sessao);
    return sessao;
  }

  async obter(id: string) {
    return this.sessoes.get(id);
  }

  async salvar(sessao: SessaoImplantacao) {
    sessao.atualizadaEm = new Date().toISOString();
    this.sessoes.set(sessao.id, sessao);
  }
}
