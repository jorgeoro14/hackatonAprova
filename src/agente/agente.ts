import Anthropic from "@anthropic-ai/sdk";
import type { BaseConhecimento } from "../knowledge/loader.js";
import { indexar } from "../knowledge/search.js";
import { DEFINICOES, executarFerramenta } from "./ferramentas.js";
import { montarSystem } from "./prompt.js";
import type { SessaoImplantacao } from "./sessao.js";

/** Função que cria uma mensagem na API. Injetável para testes. */
export type CriarMensagem = (
  params: Anthropic.Beta.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Beta.BetaMessage>;

export function criarMensagemAnthropic(client = new Anthropic()): CriarMensagem {
  return (params) => client.beta.messages.create(params);
}

export interface OpcoesAgente {
  modelo: string;
  /** Limite de idas e voltas com ferramentas por mensagem do servidor */
  maxIteracoes?: number;
}

export interface ChamadaFerramenta {
  nome: string;
  entrada: unknown;
  erro: boolean;
}

export interface RespostaAgente {
  texto: string;
  ferramentas: ChamadaFerramenta[];
  motivoParada: Anthropic.Beta.BetaStopReason | "max_iteracoes" | null;
}

/**
 * Se a resposta terminou com tool_use sem ser executada, responde cada chamada com erro
 * para que o histórico continue válido na próxima mensagem.
 */
function fecharChamadasPendentes(sessao: SessaoImplantacao, resposta: Anthropic.Beta.BetaMessage) {
  const pendentes = resposta.content.filter((b) => b.type === "tool_use");
  if (pendentes.length === 0) return;
  sessao.mensagens.push({
    role: "user",
    content: pendentes.map((b) => ({
      type: "tool_result" as const,
      tool_use_id: b.id,
      is_error: true,
      content: "chamada não executada (resposta interrompida)",
    })),
  });
}

const MENSAGEM_RECUSA =
  "Não consegui responder a essa mensagem. Pode reformular ou seguir para o próximo ponto da implantação?";

export class AgenteImplantacao {
  constructor(
    private readonly criarMensagem: CriarMensagem,
    private readonly base: BaseConhecimento,
    private readonly opcoes: OpcoesAgente,
  ) {}

  /**
   * Processa uma mensagem do servidor: chama o modelo, executa as ferramentas pedidas e repete
   * até o modelo responder em texto. O histórico da sessão só recebe acréscimos.
   */
  async responder(sessao: SessaoImplantacao, textoServidor: string): Promise<RespostaAgente> {
    const dominio = this.base.dominios.get(sessao.dominio);
    if (!dominio) throw new Error(`domínio ${sessao.dominio} não existe`);

    const system = montarSystem(this.base, dominio);
    const trechos = indexar(this.base, sessao.dominio);
    const ferramentas: ChamadaFerramenta[] = [];
    const textos: string[] = [];
    const maxIteracoes = this.opcoes.maxIteracoes ?? 15;

    sessao.mensagens.push({ role: "user", content: textoServidor });

    for (let i = 0; i < maxIteracoes; i++) {
      const resposta = await this.criarMensagem({
        model: this.opcoes.modelo,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system,
        tools: DEFINICOES,
        messages: sessao.mensagens,
      });

      // Guarda o conteúdo completo (incluindo thinking) para reenviar sem alterações.
      sessao.mensagens.push({ role: "assistant", content: resposta.content });
      for (const b of resposta.content) if (b.type === "text") textos.push(b.text);

      switch (resposta.stop_reason) {
        case "tool_use":
          break;
        case "pause_turn":
          continue;
        case "refusal":
          fecharChamadasPendentes(sessao, resposta);
          return { texto: MENSAGEM_RECUSA, ferramentas, motivoParada: "refusal" };
        default:
          // ex.: max_tokens no meio de uma chamada — a entrada pode estar truncada, então não executa.
          fecharChamadasPendentes(sessao, resposta);
          return { texto: textos.join("\n\n"), ferramentas, motivoParada: resposta.stop_reason };
      }

      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== "tool_use") continue;
        const r = executarFerramenta(bloco.name, bloco.input, { sessao, base: this.base, trechos });
        ferramentas.push({ nome: bloco.name, entrada: bloco.input, erro: Boolean(r.erro) });
        resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: r.conteudo, ...(r.erro ? { is_error: true } : {}) });
      }
      // Todos os resultados vão numa única mensagem de usuário.
      sessao.mensagens.push({ role: "user", content: resultados });
    }

    return { texto: textos.join("\n\n"), ferramentas, motivoParada: "max_iteracoes" };
  }
}
