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

> TODO: alinhar esta lista com os tipos de campo reais do construtor de formulários da Aprova.
