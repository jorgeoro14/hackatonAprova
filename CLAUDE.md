# CLAUDE.md

Backend (Node + TypeScript, ESM) do agente que coleta requisitos de implantação da Aprova via chat e preenche o `FormularioImplantacao`. Só backend.

## Comandos

- `npm run kb:validate` — valida a base de conhecimento (rode após editar `knowledge/`).
- `npm run typecheck` / `npm test` / `npm run dev`.

## Arquitetura

- `knowledge/sistema/` é fixa; `knowledge/dominios/<id>/{legislacao,processos}` muda por domínio implantado.
- Schemas em `src/knowledge/schemas.ts` são a fonte da verdade do formato da base. Ao mudar um schema, atualize `knowledge/README.md` e `knowledge/sistema/02-tipos-de-campo.md` se aplicável.
- `baseLegal` em processos referencia `id` de normas do mesmo domínio; o loader rejeita referências quebradas.
- Imports relativos usam sufixo `.js` (NodeNext).

## Convenções

- Código, identificadores e conteúdo em português.
- Nunca inventar normas, prazos ou valores na base: marcar com `> TODO`.
