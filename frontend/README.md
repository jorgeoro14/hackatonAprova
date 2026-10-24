# Front-end · Agente de implantação (Aprova)

> **Hackathon Aprova · Desafio Implantação:** como coletar e validar a regra de negócio de ~100 processos por prefeitura **sem depender de reunião**?

Este é o front-end da solução: um **chat** onde a prefeitura conversa com o agente de IA (que preenche o formulário de implantação) e um **dashboard** onde implantadores e a head de implantação acompanham conversas, regras coletadas e resultados.

## O que a solução entrega

| Meta do desafio | Como o front mostra |
|---|---|
| Menos horas de reunião | KPI **Reuniões** (sucesso = diminui, vs. processo manual) |
| Menos idas e vindas | **Idas e vindas por processo** + pendências destacadas no formulário |
| Menos tempo validando formulário | Prefeitura **revisa e edita** o formulário já preenchido e confirma com um clique |
| Mais processos no ar com regra | **Processos com regra completa** por cliente, secretaria e implantador |
| Tempo do implantador | KPIs **Tempo economizado** e **Tempo de criação do fluxo** |

Canal: chat web (MVP); a arquitetura já prevê trocar a identificação por telefone do **WhatsApp**.

## Como rodar

Requisitos: Node 20.19+ (ou 22+).

```bash
cd frontend
cp .env.example .env            # já vem com VITE_USE_MOCKS=true (back simulado)
npm install --legacy-peer-deps
npm run dev                     # http://localhost:5173
```

`npm run build` gera a versão de produção (`npm run preview` para servir). Para usar o **back real**: `VITE_USE_MOCKS=false` e `VITE_API_URL=http://localhost:3333/api/v1` (contrato em [`docs/BACKEND_CONTRACT.md`](../docs/BACKEND_CONTRACT.md)).

### Acessos de demonstração (senha `demo123`)

| Perfil | Acesso |
|---|---|
| Prefeitura | `/chat` · telefone `(51) 99999-0001` entra direto; qualquer outro faz o cadastro |
| Implantador | `maria.silva` · `carlos.souza` · `ana.lima` em `/login` |
| Head de implantação | `head` em `/login` |

`/chat?reset` recomeça a demonstração do chat. Roteiro de apresentação em [`docs/DEMO.md`](../docs/DEMO.md).

## Mocks (sem back-end)

Com `VITE_USE_MOCKS=true`, o MSW intercepta a API (`src/lib/mocks`), com 5 prefeituras × 100 processos, 3 implantadores e 1 head. Se o navegador não suportar Service Worker, cai para um interceptador de `fetch`.

## Estrutura

- `src/types/schemas.ts`: contrato (zod); tipos inferidos daqui
- `src/lib/api`: client, endpoints, hooks (TanStack Query), stores de auth/sessão
- `src/lib/theme`: tokens claro/escuro (chat sempre claro; dashboard escuro por padrão com alternância)
- `src/features/{chat,auth,dashboard}`: lógica por área · `src/pages`: telas · `src/components/ui`: base
- `/ui` (só em dev): galeria de componentes

## Instruções do agente

A pasta [`INSTRUCTIONS/frontend`](../INSTRUCTIONS/frontend/README.md) documenta as instruções que guiam o agente de código e como o chat trata cada saída do agente de IA. Plano de tasks: [`docs/FRONTEND_PLAN.md`](../docs/FRONTEND_PLAN.md).
