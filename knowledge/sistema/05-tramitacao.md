---
id: tramitacao
titulo: Tramitação — caixa de entrada, despachos, encaminhamentos e prazos
tags: [tramitacao, despacho, encaminhar, caixa-de-entrada, etapa, prazo, exigencia, servidor]
fontes:
  - https://www.aprova.com.br/funcionalidades
  - https://aprova.com.br/funcionalidades/aprova-ia
  - https://aprova.com.br/solucoes/obras
---

# Tramitação do processo

Depois de protocolado, o processo anda entre setores e pessoas até a decisão. Cada movimentação fica registrada no histórico, com data, hora e responsável.

## Caixa de entrada

- **Caixa de entrada única:** o servidor vê num só lugar os processos que estão com ele ou com o setor, com status como "Em análise" ou "Para assinar".
- **Busca inteligente:** por número de protocolo, CPF/CNPJ, inscrição do imóvel ou assunto.
- Status que aparecem nas telas: "Em trâmite", "Em andamento", "Concluído".

## Dentro do processo

Abas vistas nas telas: **Início**, **Despacho**, **Íntegra**, **Resumo**, **Área interna**, **Taxas**, **Histórico**, **Documentos**.

- **Resumo:** visão rápida do processo e dos dados principais.
- **Área interna:** informações que só os servidores veem.
- **Íntegra:** o relatório "capa a capa" (ver `assinaturas-e-documentos`).
- **Histórico:** linha do tempo de todas as movimentações.

## Movimentar o processo

- **Despacho:** ato do servidor que registra uma análise, decisão ou providência. É o que movimenta o processo. Pode usar **respostas padrões** (textos prontos) e pode ser rascunhado pela IA (ver `ia-lume`).
- **Encaminhar:** o servidor escolhe o **destinatário** (setor e/ou responsável), o **tipo de encaminhamento** (ex.: "análise do projeto") e escreve o texto do despacho.
- **Encaminhar para múltiplos usuários:** enviar para mais de uma pessoa ao mesmo tempo (ex.: pareceres paralelos).
- **Vincular:** relacionar processos entre si (ex.: a LI vinculada à LAP do mesmo empreendimento).
- **Exigência:** devolve o processo ao requerente para corrigir ou complementar; o processo fica aguardando ("O processo aguarda ajuste do projeto antes de seguir para análise").

## Etapas, prazos e automação

- **Controle de etapas:** cada tipo de processo tem um fluxo de etapas configurado; o andamento fica visível (ex.: habite-se em 5 etapas).
- **Controle de prazos:** prazos por etapa e alertas automáticos.
- **Workflow automático / processos automáticos:** etapas que avançam sozinhas (ex.: confirmação automática do pagamento da taxa, validação pelo Plano Diretor no protocolo).
- **Sigilo de dados** e **moderador** constam da lista de funcionalidades.

## Como isso vira configuração na implantação

| Na tela | No formulário de implantação |
|---|---|
| Setor/destinatário do encaminhamento | `setores` e `fluxo.etapas[].responsavel` |
| Tipo de encaminhamento + texto | `despachos[]` (tipo, etapa, levaPara, texto) |
| Respostas padrões | `despachos[].texto` |
| Exigência ao requerente | etapa do tipo `exigencia` + despacho do tipo `exigencia` |
| Prazos e alertas | `fluxo.etapas[].prazoDias`, `fluxo.prazoTotalDias` |

> TODO: confirmar com o time o que "Sigilo de dados" e "Moderador" fazem, se o prazo é por etapa ou por processo e se a contagem em dias úteis é suportada.
