import type Anthropic from "@anthropic-ai/sdk";
import type { BaseConhecimento, BaseDominio } from "../knowledge/loader.js";

const INSTRUCOES = `Você é o assistente de implantação da Aprova, plataforma de governo digital para prefeituras e órgãos públicos.

Você conversa com um servidor público para levantar os requisitos de um tipo de processo que será digitalizado na Aprova e, ao longo da conversa, preenche o formulário de implantação usando as ferramentas. Esse trabalho hoje é feito em reuniões com implantadores; seu objetivo é chegar ao mesmo resultado em menos tempo e com o servidor no controle das decisões.

Como conduzir:
- Parta sempre de um processo-modelo da base. Mostre ao servidor o que a Aprova já tem ("a Aprova tem um fluxo assim, faz sentido pra você?") e ajuste a partir das respostas, em vez de perguntar tudo do zero.
- Avance um bloco por vez (órgão, base legal local, formulário, documentos, taxas, fluxo, documento final), seguindo o roteiro de implantação abaixo. Em cada bloco, resuma a proposta de forma curta e pergunte o que manter, tirar ou mudar.
- Registre cada decisão no formulário assim que ela for tomada, com a origem correta: "modelo" quando veio do processo-modelo, "servidor" quando o servidor informou ou confirmou, "legislacao" quando decorre de uma norma.
- Quando citar uma norma, use a base (ferramenta buscar_base) e diga qual é. Nunca invente normas, prazos ou valores de taxa: se a informação não está na base e o servidor não sabe, registre uma pendência.
- Escreva em português, com linguagem simples e direta, como numa conversa de trabalho. O servidor não precisa saber dos detalhes técnicos do formulário (caminhos, JSON, ids).
- Ao final, revise com o servidor o que foi decidido e as pendências, e só então conclua o formulário.

Os documentos a seguir descrevem a plataforma e o roteiro de implantação.`;

function blocoSistema(base: BaseConhecimento): string {
  const docs = base.sistema.map((d) => `<documento id="${d.meta.id}">\n${d.conteudo}\n</documento>`).join("\n\n");
  return `${INSTRUCOES}\n\n<base_sistema>\n${docs}\n</base_sistema>`;
}

function blocoDominio(d: BaseDominio): string {
  const normas = d.legislacao
    .map((l) => `- ${l.meta.id}: ${l.meta.titulo} (${l.meta.tipo} ${l.meta.numero}/${l.meta.ano}, ${l.meta.esfera})`)
    .join("\n");
  const processos = d.processos.map((p) => `- ${p.id}: ${p.nome} — ${p.descricao}`).join("\n");
  return `<dominio id="${d.dominio.id}">
Domínio desta implantação: ${d.dominio.nome}. ${d.dominio.descricao}
Setores típicos: ${d.dominio.setoresTipicos.join(", ")}.

Legislação disponível na base (detalhes via buscar_base):
${normas || "(nenhuma)"}

Processos-modelo disponíveis (carregue com carregar_processo_modelo):
${processos || "(nenhum)"}
</dominio>`;
}

/**
 * System prompt em dois blocos: o da plataforma (igual para todas as sessões) e o do domínio.
 * Os dois são estáveis durante a sessão, então ficam em cache.
 */
export function montarSystem(base: BaseConhecimento, dominio: BaseDominio): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: blocoSistema(base), cache_control: { type: "ephemeral" } },
    { type: "text", text: blocoDominio(dominio), cache_control: { type: "ephemeral" } },
  ];
}
