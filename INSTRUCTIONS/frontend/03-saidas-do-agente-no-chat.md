# Como o chat trata as saídas do agente de IA

O agente (back-end) responde a cada mensagem com um objeto `Message`. O front decide a exibição pelo campo `kind`.

| `kind` | O que o agente quer | O que o front faz |
|---|---|---|
| `text` | Conversar, perguntar, confirmar | Bolha de texto. Markdown mínimo e seguro: `**negrito**`, listas com `-`. Nunca executa HTML |
| `quick_replies` | Oferecer respostas prontas | Botões abaixo da **última** mensagem do agente; clicar envia `quickReplyId` |
| `form` | Entregar o formulário já preenchido (`formularioId`) | Busca `GET …/forms/:id` e mostra o formulário **com campos editáveis** |

## Formulário (`kind: "form"`)
- Preenchido pelo agente no back (`FormularioImplantacao`); a prefeitura **não vê o preenchimento acontecer**, só o resultado.
- **Todos os campos são editáveis** (ex.: `NOME [PREFEITURA DA VILA DOS HOBBITS]` → ela corrige).
- Selo de origem por bloco (`origens`): *Do modelo*, *Você informou*, *Da legislação*.
- `pendencias[]` (caminho relativo ao processo, ex.: `taxas.0.baseCalculo`): campo vazio e pendente mostra "Falta informar"; há contador. Pode enviar com pendências.
- **Um único botão**, "Confirmar e enviar ao time" → `POST …/forms/:id/submit` com `{ orgao, processo }` revisados. O back muda o status para `confirmado` e responde com uma mensagem do agente.
- Após confirmado, o formulário fica somente leitura. Propriedades que o front não edita são preservadas no envio.

## Anexos
Até 5 por mensagem, 10 MB cada (PDF, imagem, planilha, DOCX, TXT). Enviados antes (`POST …/attachments`) e referenciados por `attachmentIds`.

## Sessão
`sessionId` + `sessionToken` (header `X-Session-Token`) ficam no navegador para retomar a conversa. Sessão inválida (`401`) volta para a identificação.
