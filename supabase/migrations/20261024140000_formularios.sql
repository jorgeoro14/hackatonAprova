-- Formulários de implantação: o FormularioImplantacao (src/implantacao/formulario.ts) gerado na conversa.
-- Cada revisão do agente sobrescreve `dados` e incrementa `revisao`; o painel só lê.
-- RLS ligado e sem policies, como nas demais tabelas: só o backend acessa.

create type public.status_formulario as enum ('rascunho', 'em_revisao', 'confirmado');

create table public.formularios (
  id             uuid primary key default gen_random_uuid(),
  conversa_id    uuid not null references public.conversas (id) on delete cascade,
  processo_id    uuid references public.processos (id) on delete set null,
  dominio        text not null,
  status         public.status_formulario not null default 'rascunho',
  dados          jsonb not null,
  revisao        integer not null default 1 check (revisao >= 1),
  confirmado_em  timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
comment on table public.formularios is 'FormularioImplantacao completo em `dados` (jsonb); processo_id é nulo até o vínculo com o processo.';

create index formularios_conversa_id_idx on public.formularios (conversa_id);
create index formularios_processo_id_idx on public.formularios (processo_id);

create trigger formularios_atualizado_em before update on public.formularios
  for each row execute function public.definir_atualizado_em();

alter table public.formularios enable row level security;
