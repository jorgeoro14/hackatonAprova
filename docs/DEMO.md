# Roteiro da demonstração (≈ 4 min)

Pré-requisito: `cd frontend && npm install --legacy-peer-deps && npm run dev`. Abra `http://localhost:5173/chat?reset` para começar limpo. Senha de todos os usuários: `demo123`.

**Mensagem central:** o implantador não faz reunião para levantar requisito. A prefeitura conversa com o agente, revisa um formulário pronto e o resultado aparece no dashboard.

## 1. A prefeitura (chat, tema claro) · 1:30
1. Em `/chat`, digite o telefone `(51) 99999-8888` (desconhecido): mostra o cadastro de prefeitura e secretaria. Volte e use `(51) 99999-0001` para entrar direto ("o WhatsApp fará isso sozinho").
2. Responda ao agente 4 vezes (ex.: *Alvará de reforma* → *documento, matrícula e ART* → *taxa de análise* → *30 dias*). Mostre o anexo (clipe) se quiser.
3. O agente entrega o **formulário preenchido**. Mostre: selos de origem (*Do modelo / Você informou / Da legislação*) e as **2 pendências** ("Falta informar").
4. Edite o **Município** para "Prefeitura da Vila dos Hobbits", preencha a taxa e o prazo total, e clique em **Confirmar e enviar ao time**. O agente confirma.

## 2. O implantador (dashboard, tema escuro) · 1:30
1. `/login` com `maria.silva`. **Visão geral:** reuniões (seta verde = caiu vs. processo manual), horas economizadas e tempo de criação do fluxo. Alterne para o tema claro.
2. **Clientes → Prefeitura de Canoas:** progresso por secretaria → aba **Processos** → abra um processo: regras por seção, status (preenchido / a validar / pendente) e **"Ver conversa"** de origem.
3. Aba **Reuniões → Registrar reunião**: o contador sobe (indicador "quanto menos, melhor").
4. Mostre que ela **só vê os seus 2 clientes**.

## 3. A head de implantação · 1:00
1. Saia e entre com `head`. Nav ganha **Time**: ranking ordenável, comparativo por métrica e **clientes em risco** (São Leopoldo).
2. Clique em um implantador → **Ver o dashboard dele(a)** (mesmas telas filtradas).

## Plano B
- **Vídeo de backup:** grave este roteiro (QuickTime/Win+G, 4 min) e salve como `docs/demo-backup.mp4` (ou link no README) **antes das 16h**.
- Se o Service Worker falhar, o app usa um interceptador de `fetch` automaticamente; recarregar a página resolve.
- Telas travadas no chat: `/chat?reset`.
