-- Dashboard de implantação: usuários, prefeituras, processos, regras coletadas, conversas e reuniões.
-- Convenções: tabelas no plural em snake_case, PK uuid, datas timestamptz (UTC), durações em minutos.
-- RLS ligado em todas as tabelas e sem policies: a API pública do Supabase (anon/authenticated) não lê nada;
-- só o backend, conectado com o papel postgres, acessa os dados e aplica o escopo por implantador.

-- ---------- Tipos ----------

create type public.papel_usuario as enum ('implementer', 'head');

create type public.status_processo as enum (
  'not_started', 'collecting', 'awaiting_confirmation', 'confirmed', 'sent_to_dev', 'validated'
);

create type public.status_campo as enum ('filled', 'pending', 'to_validate');

create type public.origem_campo as enum ('agente', 'implantador');

create type public.categoria_campo as enum (
  'documento', 'prazo', 'taxa', 'etapa', 'setor', 'despacho', 'campo_formulario', 'base_legal', 'outro'
);

create type public.status_conversa as enum ('active', 'waiting_confirmation', 'closed');

create type public.papel_mensagem as enum ('user', 'agent', 'system');

create type public.tipo_mensagem as enum ('text', 'quick_replies', 'form');

-- ---------- atualizado_em automático ----------

create function public.definir_atualizado_em() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ---------- Tabelas ----------

create table public.usuarios (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  username       text not null unique,
  senha_hash     text not null,
  papel          public.papel_usuario not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
comment on table public.usuarios is 'Implantadores e head de implantação (login do dashboard).';

create table public.clientes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  uf              char(2) not null,
  implantador_id  uuid not null references public.usuarios (id),
  iniciado_em     timestamptz not null,
  data_meta       timestamptz not null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint clientes_meta_depois_do_inicio check (data_meta > iniciado_em)
);
comment on table public.clientes is 'Prefeitura atendida. O status (onboarding, em risco...) é calculado pelo backend.';

create table public.secretarias (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  nome        text not null,
  criado_em   timestamptz not null default now(),
  unique (cliente_id, nome)
);

create table public.processos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references public.clientes (id) on delete cascade,
  secretaria_id        uuid not null references public.secretarias (id) on delete cascade,
  nome                 text not null,
  status               public.status_processo not null default 'not_started',
  idas_e_vindas        integer not null default 0 check (idas_e_vindas >= 0),
  primeiro_contato_em  timestamptz,
  concluido_em         timestamptz,
  validado_em          timestamptz,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
comment on table public.processos is 'Processo/serviço da prefeitura (ex.: Alvará de reforma).';
comment on column public.processos.idas_e_vindas is 'Vezes que voltou para coleta depois de apresentado/confirmado.';
comment on column public.processos.concluido_em is 'Quando a regra ficou completa (confirmed).';
comment on column public.processos.validado_em is 'Quando o fluxo foi validado; fim do tempo de criação do fluxo.';

create table public.campos_processo (
  id                  uuid primary key default gen_random_uuid(),
  processo_id         uuid not null references public.processos (id) on delete cascade,
  chave               text not null,
  rotulo              text not null,
  categoria           public.categoria_campo not null default 'outro',
  valor               text,
  status              public.status_campo not null default 'pending',
  origem              public.origem_campo not null default 'agente',
  coletado_em         timestamptz,
  mensagem_origem_id  uuid,
  anexo_origem_id     uuid,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (processo_id, chave)
);
comment on table public.campos_processo is 'Item de regra de negócio coletado para um processo. Base das horas economizadas.';

create table public.contatos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  telefone       text not null unique,
  cliente_id     uuid not null references public.clientes (id) on delete cascade,
  secretaria_id  uuid references public.secretarias (id) on delete set null,
  criado_em      timestamptz not null default now()
);
comment on column public.contatos.telefone is 'E.164 (+5551999998888).';

create table public.conversas (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.clientes (id) on delete cascade,
  contato_id          uuid not null references public.contatos (id) on delete cascade,
  secretaria_id       uuid references public.secretarias (id) on delete set null,
  token_sessao_hash   text,
  status              public.status_conversa not null default 'active',
  iniciada_em         timestamptz not null default now(),
  ultima_mensagem_em  timestamptz not null default now()
);

create table public.conversa_processos (
  conversa_id  uuid not null references public.conversas (id) on delete cascade,
  processo_id  uuid not null references public.processos (id) on delete cascade,
  primary key (conversa_id, processo_id)
);

create table public.mensagens (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references public.conversas (id) on delete cascade,
  papel        public.papel_mensagem not null,
  tipo         public.tipo_mensagem not null default 'text',
  texto        text not null default '',
  dados        jsonb,
  criada_em    timestamptz not null default now()
);
comment on column public.mensagens.dados is 'quickReplies, form e attachments no formato Message do contrato.';

-- origem de um campo aponta para a mensagem em que a informação apareceu
alter table public.campos_processo
  add constraint campos_processo_mensagem_origem_fk
  foreign key (mensagem_origem_id) references public.mensagens (id) on delete set null;

create table public.reunioes (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes (id) on delete cascade,
  realizada_em     timestamptz not null,
  duracao_minutos  integer not null check (duracao_minutos > 0),
  notas            text not null default '',
  registrada_por   uuid references public.usuarios (id) on delete set null,
  criado_em        timestamptz not null default now()
);
comment on table public.reunioes is 'Reuniões registradas pelo implantador; comparadas ao baseline do modelo manual.';

-- ---------- Índices (FKs e filtros por período) ----------

create index clientes_implantador_id_idx on public.clientes (implantador_id);
create index secretarias_cliente_id_idx on public.secretarias (cliente_id);
create index processos_cliente_id_idx on public.processos (cliente_id);
create index processos_secretaria_id_idx on public.processos (secretaria_id);
create index processos_validado_em_idx on public.processos (validado_em) where validado_em is not null;
create index campos_processo_processo_id_idx on public.campos_processo (processo_id);
create index campos_processo_coletado_em_idx on public.campos_processo (coletado_em) where coletado_em is not null;
create index campos_processo_mensagem_origem_id_idx on public.campos_processo (mensagem_origem_id);
create index contatos_cliente_id_idx on public.contatos (cliente_id);
create index contatos_secretaria_id_idx on public.contatos (secretaria_id);
create index conversas_cliente_id_idx on public.conversas (cliente_id);
create index conversas_contato_id_idx on public.conversas (contato_id);
create index conversas_secretaria_id_idx on public.conversas (secretaria_id);
create index conversa_processos_processo_id_idx on public.conversa_processos (processo_id);
create index mensagens_conversa_id_criada_em_idx on public.mensagens (conversa_id, criada_em);
create index reunioes_cliente_id_realizada_em_idx on public.reunioes (cliente_id, realizada_em);
create index reunioes_registrada_por_idx on public.reunioes (registrada_por);

-- ---------- Triggers ----------

create trigger usuarios_atualizado_em before update on public.usuarios
  for each row execute function public.definir_atualizado_em();
create trigger clientes_atualizado_em before update on public.clientes
  for each row execute function public.definir_atualizado_em();
create trigger processos_atualizado_em before update on public.processos
  for each row execute function public.definir_atualizado_em();
create trigger campos_processo_atualizado_em before update on public.campos_processo
  for each row execute function public.definir_atualizado_em();

-- ---------- RLS ----------

alter table public.usuarios enable row level security;
alter table public.clientes enable row level security;
alter table public.secretarias enable row level security;
alter table public.processos enable row level security;
alter table public.campos_processo enable row level security;
alter table public.contatos enable row level security;
alter table public.conversas enable row level security;
alter table public.conversa_processos enable row level security;
alter table public.mensagens enable row level security;
alter table public.reunioes enable row level security;
