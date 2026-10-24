import type { ClienteAgente, PedidoAgente, ResultadoAgente } from "../../src/agente/cliente.js";
import { novoFormulario } from "../../src/implantacao/formulario.js";
import type { ProcessoModelo } from "../../src/knowledge/schemas.js";

/**
 * Agente de mentira para testes e para `npm run demo:local`: devolve o formulário do processo-modelo
 * e fica "pronto para revisão" a partir da 2ª mensagem da prefeitura. Não é o agente real (trilha A).
 */
export function agenteFalso(modelo: ProcessoModelo, { prontoNoTurno = 2 }: { prontoNoTurno?: number } = {}) {
  const pedidos: PedidoAgente[] = [];
  const agente: ClienteAgente = {
    async turno(pedido) {
      pedidos.push(pedido);
      const turnos = pedido.messages.filter((m) => m.role === "employee").length;
      const form = novoFormulario("agente-id", modelo, { municipio: pedido.municipio, uf: "PR", orgao: "Meio Ambiente", responsavel: { nome: "Ana" } });
      return {
        assistant_reply: turnos >= prontoNoTurno ? "Terminei! Confira o formulário." : "Anotado. E o prazo?",
        form: { ...form, status: "confirmado" }, // o agente nunca confirma: o back ignora
        pendencias: form.pendencias,
        pronto_para_revisao: turnos >= prontoNoTurno,
      } satisfies ResultadoAgente;
    },
  };
  return { agente, pedidos };
}
