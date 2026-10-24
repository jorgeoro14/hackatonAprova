---
id: assinaturas-e-documentos
titulo: Assinaturas digitais e documentos gerados
tags: [assinatura, icp-brasil, lote, externo, documento-final, modelo, capa-a-capa, integra]
fontes:
  - https://aprova.com.br/
  - https://www.aprova.com.br/funcionalidades
  - https://www.aprova.com.br/processo-eletronico
---

# Assinaturas e documentos

## Assinatura digital

- Padrão **ICP-Brasil**, incluída **sem custo adicional**.
- **Assinatura em lote:** vários documentos de uma vez.
- **Pessoas externas** assinam só com o e-mail, **sem cadastro prévio** (ex.: responsável técnico, conselheiro, representante de empresa).
- **Fluxo de assinaturas:** um documento pode exigir mais de um assinante. Telas mostram listas de assinaturas pendentes, solicitadas e assinadas.

## Documentos gerados pelo sistema

- **Documento final por modelo:** licença, alvará, certidão, habite-se, TAC, certidão de dispensa — gerados a partir de um modelo padronizado com os dados do processo e assinados digitalmente.
  - Exemplo de alvará: número, requerente, zoneamento, data de emissão, validade, declarações do responsável técnico e assinatura.
  - Exemplo de licença ambiental: licença com condicionantes e validade.
- **Pareceres e despachos** também viram documentos do processo, com assinantes.
- **Relatório na íntegra (capa a capa):** reúne despachos, anexos e informações do processo num único arquivo, gerado automaticamente conforme o processo avança. Útil para auditoria.
- **Visualizador de PDF** e **controle de documentos** dentro do processo.

## Como isso vira configuração na implantação

- Quem assina cada despacho → `despachos[].exigeAssinatura` e `despachos[].assinante`.
- Documento emitido no deferimento → `documentoFinal` (nome, numeração, texto-base, validade, assinante).

> TODO: confirmar quais variáveis os modelos de documento aceitam e como é feita a numeração sequencial.
