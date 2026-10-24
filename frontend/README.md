# Front-end — Agente de implantação (Aprova)

Chat para as prefeituras + dashboard para implantadores e head de implantação.
Plano e tasks: [`docs/FRONTEND_PLAN.md`](../docs/FRONTEND_PLAN.md) · Contrato com o back: [`docs/BACKEND_CONTRACT.md`](../docs/BACKEND_CONTRACT.md).

## Como rodar

```bash
cd frontend
cp .env.example .env     # já vem com VITE_USE_MOCKS=true
npm install --legacy-peer-deps
npm run dev              # http://localhost:5173
```

Scripts: `npm run dev` · `npm run build` (typecheck + build) · `npm run typecheck`.

## Mocks (sem back-end)

Com `VITE_USE_MOCKS=true` o MSW intercepta a API (`src/lib/mocks`). Usuários de teste (senha `demo123`):
`head` (head de implantação), `maria.silva`, `carlos.souza`, `ana.lima` (implantadores).
No chat, o telefone `+5551999990001` é "reconhecido"; qualquer outro cai no cadastro de prefeitura/secretaria.

Para usar o back real: `VITE_USE_MOCKS=false` e `VITE_API_URL=http://localhost:3000/api/v1`.

## Estrutura

- `src/types/schemas.ts` — contrato (zod) = fonte dos tipos
- `src/lib/api` — client, endpoints, hooks (TanStack Query), stores de auth/sessão
- `src/lib/theme` — tokens claro/escuro (`ThemeScope`: chat sempre claro; dashboard escuro por padrão)
- `src/components/ui` — componentes base
- `/ui` (só em dev) — galeria de componentes e teste da API simulada
