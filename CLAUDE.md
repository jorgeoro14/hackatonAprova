# CLAUDE.md

Backend (Node + TypeScript, ESM) do agente que coleta requisitos de implantação da Aprova via chat e preenche o `FormularioImplantacao`. Só backend.

## Comandos

- `npm run kb:validate` — valida a base de conhecimento (rode após editar `knowledge/`).
- `npm run kb:importar-leis [-- <dominio>]` — (re)importa o texto das normas de `legislacao/fontes.json`; preserva a seção "Relevância para a implantação", que é escrita à mão.
- `npm run typecheck` / `npm test` / `npm run dev`.
- `npm run db:migrate` — aplica `supabase/migrations/*.sql` no Postgres de `DATABASE_URL` (Supabase). Mudança de esquema = migration nova, nunca editar uma já aplicada.
- `npm run db:seed` — apaga e recria os dados de demo do dashboard (TRUNCATE CASCADE; não usar em banco com dados reais).
- Testes usam PGlite (Postgres embutido) via `test/apoio/pglite.ts`; não precisam de Supabase.

Dashboard (`/api/v1`): rotas em `src/dashboard/rotas.ts`, fórmulas em `src/dashboard/metricas.ts`, premissas em `src/dashboard/parametros.ts` — documentadas em `docs/metricas-dashboard.md` (mantenha em sincronia).

## Arquitetura

- `knowledge/sistema/` é fixa; `knowledge/dominios/<id>/{legislacao,processos}` muda por domínio implantado.
- Schemas em `src/knowledge/schemas.ts` são a fonte da verdade do formato da base. Ao mudar um schema, atualize `knowledge/README.md` e `knowledge/sistema/02-tipos-de-campo.md` se aplicável.
- `baseLegal` em processos referencia `id` de normas do mesmo domínio; o loader rejeita referências quebradas.
- Imports relativos usam sufixo `.js` (NodeNext).

## Convenções

- Código, identificadores e conteúdo em português.
- Nunca inventar normas, prazos ou valores na base: marcar com `> TODO`.
