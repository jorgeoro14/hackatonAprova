---
id: tipos-de-campo
titulo: Tipos de campo de formulário
tags: [formulario, campos]
---

# Tipos de campo de formulário

Tipos aceitos no schema `ProcessoModelo` (campo `tipo`). O agente só deve propor campos destes tipos.

| tipo | Uso |
|---|---|
| `texto` | Texto curto (nome, razão social). |
| `texto_longo` | Descrição livre (descrição da atividade). |
| `numero` | Número (área em m², nº de funcionários). |
| `moeda` | Valor em R$. |
| `data` | Data. |
| `cpf`, `cnpj`, `cpf_cnpj` | Documento com validação. |
| `email`, `telefone`, `cep` | Contato/endereço com validação. |
| `endereco` | Endereço completo. |
| `selecao` | Uma opção de uma lista (`opcoes`). |
| `multipla_escolha` | Várias opções de uma lista (`opcoes`). |
| `sim_nao` | Booleano. |
| `anexo` | Upload de arquivo dentro do formulário. |
| `coordenadas` | Latitude/longitude ou polígono (georreferenciamento). |
| `lista` | Grupo de campos repetível (ex.: vários responsáveis técnicos, uma linha por edificação). As colunas ficam em `campos`. |
| `processo` | Número de outro processo que já existe na Aprova (ex.: o alvará de um habite-se); a Aprova busca o processo e traz dados dele. |

Um campo pode trazer `obrigatorioSe` (condição em texto, quando `obrigatorio` é false) e `visivelSe` (quando ele aparece). Remetente e destinatário são campos de sistema e não entram no formulário.

> TODO: alinhar esta lista com os tipos de campo reais do construtor de formulários da Aprova.
