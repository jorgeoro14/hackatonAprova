# Convenções do projeto (front-end)

Aplicadas a todo código em `frontend/`.

## Stack
Vite + React 19 + TypeScript (strict) · React Router · TanStack Query (estado de servidor) · Zustand (auth, tema, sessão do chat) · Tailwind v4 com tokens CSS · Recharts · Zod (contrato) · MSW (back simulado).

## Estrutura
- `src/types/schemas.ts`: **fonte única do contrato** (zod). Tipos TypeScript são inferidos daqui; nunca duplicar tipos à mão.
- `src/lib/api`: `client.ts` (fetch + erros), `endpoints.ts` (uma função por rota), `hooks.ts` (TanStack Query). Telas nunca chamam `fetch` direto.
- `src/features/<área>`: lógica e componentes de cada área (`chat`, `auth`, `dashboard`). `src/pages`: só montam telas.
- `src/components/ui`: componentes base sem regra de negócio.
- `src/lib/mocks`: back simulado idêntico ao contrato; trocar por back real é só `VITE_USE_MOCKS=false`.

## Regras
1. Toda resposta da API é validada com zod em `request()`. Mudou o contrato? Mude `schemas.ts` e `docs/BACKEND_CONTRACT.md` juntos.
2. **Filtro por perfil é do back.** O front só esconde interface (`RequireRole`); nunca confiar nisso como segurança.
3. Cores só por tokens (`bg-bg`, `text-muted`, `text-petrol`…). Nada de hex em componentes. Tema vem de `[data-theme]` (`ThemeScope`).
4. Chat é **sempre claro**; dashboard é **escuro por padrão** com alternância persistida.
5. Textos em pt-BR; durações trafegam em **minutos**; datas ISO. Formatar apenas com `lib/utils/format.ts`.
6. Toda tela trata `loading` (esqueleto), `erro` (com "tentar novamente") e `vazio`.
7. Acessibilidade: contraste AA nos dois temas, `aria-label` em ícones/gráficos, foco visível, tabelas clicáveis com `tabIndex` + Enter, título por tela (`useTitle`).
8. Responsivo mobile-first; sem rolagem horizontal em 375 px.
9. Verificar antes de dar por pronto: `npm run build` e conferência no navegador.
