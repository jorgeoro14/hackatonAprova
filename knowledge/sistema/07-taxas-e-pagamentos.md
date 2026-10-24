---
id: taxas-e-pagamentos
titulo: Taxas e pagamentos no processo
tags: [taxa, pagamento, boleto, cobranca]
fontes:
  - https://aprova.com.br/solucoes/obras
  - https://www.aprova.com.br/solucoes/meio-ambiente
---

# Taxas e pagamentos

- O processo tem uma aba **Taxas**: a cobrança fica vinculada ao processo.
- O **pagamento é confirmado automaticamente** (no habite-se aparece "Taxa de habite-se paga — confirmação automática") e o processo segue para a próxima etapa.
- As taxas podem variar por tipo de pedido: no meio ambiente há um checklist de taxas por tipo de intervenção (ex.: poda e supressão).
- As taxas e valores ficam publicados no Portal de Serviços junto com o serviço.

## O que perguntar na implantação

- Existe taxa? Qual o nome?
- Qual a base de cálculo (valor fixo, por m², por porte/potencial poluidor…)?
- Qual a lei municipal que institui a taxa? (sem lei, registrar pendência — não inventar valor)
- Em que momento é cobrada (no protocolo, depois da análise, antes da emissão)? → `taxas[].etapa`.

> TODO: confirmar como a guia/boleto é emitida (integração com o sistema tributário do município) e como a confirmação automática é feita.
