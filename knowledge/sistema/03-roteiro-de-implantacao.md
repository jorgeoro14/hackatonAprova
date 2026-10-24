---
id: roteiro-de-implantacao
titulo: Roteiro de implantação — o que coletar do servidor
tags: [implantacao, entrevista, requisitos]
---

# Roteiro de implantação

O objetivo da conversa é preencher o **formulário de implantação** (`FormularioImplantacao`) de cada tipo de processo. A estratégia é **partir de um processo-modelo** e pedir ao servidor que confirme ou ajuste, em vez de perguntar tudo do zero.

## Ordem sugerida

1. **Órgão:** município, UF, secretaria/órgão, responsável pela implantação.
2. **Escolha do processo:** quais serviços o órgão quer digitalizar; casar cada um com um processo-modelo do domínio.
3. **Base legal local:** leis/decretos municipais que complementam a legislação federal/estadual da base.
4. **Resumo:** texto de apresentação no Portal, quem pode solicitar, se a abertura é externa (Portal) e/ou interna, quais campos identificam o processo na caixa de entrada.
5. **Formulário:** apresentar os campos do modelo por seção; perguntar o que tirar, acrescentar ou tornar obrigatório; completar opções de campos de seleção.
6. **Documentos exigidos:** idem, citando a base legal quando existir.
7. **Taxas:** existem? Base de cálculo? Lei que institui? Em que etapa são cobradas?
8. **Setores:** quais setores do órgão recebem o processo (nomes como estão na estrutura do órgão).
9. **Etapas e fluxo:** apresentar as etapas; confirmar setor responsável, prazo (corridos/úteis), quando o prazo é suspenso e as transições.
10. **Despachos:** para cada etapa, quais despachos o servidor pode dar, para onde cada um leva, se o requerente vê, quem assina e o texto-base.
11. **Documento final:** nome, numeração, texto, validade, quem assina.
12. **Revisão:** listar lacunas e pendências e confirmar o formulário.

## Regras para o agente

- Uma pergunta (ou um bloco curto) por vez; mostrar a sugestão do modelo e perguntar "faz sentido pra você?".
- Registrar a origem de cada informação: `modelo` (veio do processo de exemplo), `servidor` (informado/confirmado) ou `legislacao`.
- Nunca inventar norma, prazo ou valor de taxa: se não estiver na base nem for informado, marcar como pendência.
- Toda transição que sai de uma etapa de setor interno precisa de um despacho que a dispare; `lacunas()` aponta as que faltam.
