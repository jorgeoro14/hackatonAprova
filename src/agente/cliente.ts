import { z } from "zod";
import { FormularioImplantacao, Pendencia } from "../implantacao/formulario.js";

/** Papéis do agente (employee/assistant) ↔ banco (user/agent): quem converte é o back. */
export interface MensagemAgente {
  role: "employee" | "assistant";
  content: string;
}

export interface AnexoAgente {
  id: string;
  name: string;
  mime_type: string;
  /** texto extraído, quando o back consegue (txt/csv); os demais o agente lê pelo nome */
  text?: string;
}

export interface PedidoAgente {
  session_id: string;
  dominio: string;
  municipio: string;
  /** formulário atual da conversa; null até o agente identificar o processo */
  form: FormularioImplantacao | null;
  messages: MensagemAgente[];
  attachments?: AnexoAgente[];
}

export const ResultadoAgente = z.object({
  assistant_reply: z.string().min(1),
  form: FormularioImplantacao.nullable(),
  pendencias: z.array(Pendencia).default([]),
  pronto_para_revisao: z.boolean(),
});
export type ResultadoAgente = z.infer<typeof ResultadoAgente>;

export interface ClienteAgente {
  turno(pedido: PedidoAgente): Promise<ResultadoAgente>;
}

/** O agente não respondeu (fora do ar, lento ou resposta inválida). */
export class ErroAgente extends Error {
  constructor(
    readonly tipo: "indisponivel" | "timeout" | "resposta_invalida",
    message: string,
  ) {
    super(message);
  }
}

/** Cliente HTTP do serviço Python (agents/app/server.py): POST /turn. */
export function clienteAgenteHttp(url: string, { timeoutMs = 60_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): ClienteAgente {
  return {
    async turno(pedido) {
      let resposta: Response;
      try {
        resposta = await fetchImpl(`${url.replace(/\/$/, "")}/turn`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pedido),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        throw new ErroAgente(timeout ? "timeout" : "indisponivel", timeout ? "O agente demorou demais para responder" : "Não foi possível falar com o agente");
      }
      if (!resposta.ok) throw new ErroAgente("indisponivel", `O agente respondeu com erro ${resposta.status}`);
      const r = ResultadoAgente.safeParse(await resposta.json().catch(() => undefined));
      if (!r.success) throw new ErroAgente("resposta_invalida", "O agente devolveu uma resposta fora do contrato");
      return r.data;
    },
  };
}
