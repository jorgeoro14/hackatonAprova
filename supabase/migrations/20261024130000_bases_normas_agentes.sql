-- Bases de normas e agentes de WhatsApp.
-- bases_normas/normas espelham knowledge/dominios (fonte da verdade, versionada no git); o backend
-- sincroniza na subida (src/bases/sincronizar.ts). O implantador escolhe as bases ao criar o agente.
-- Mesmas convenções da migration do dashboard: RLS ligado e sem policies (só o backend acessa).

-- ---------- Tipos ----------

create type public.maturidade_base as enum ('pronta', 'em-revisao');

create type public.status_agente as enum ('draft', 'active', 'paused');

create type public.origem_base_agente as enum ('selecionada', 'automatica');

-- ---------- Tabelas ----------

create table public.bases_normas (
  id                  text primary key,
  nome                text not null,
  descricao           text not null,
  maturidade          public.maturidade_base not null default 'em-revisao',
  transversal         boolean not null default false,
  processos_cobertos  text[] not null default '{}',
  guia                text,
  disponivel          boolean not null default true,
  sincronizada_em     timestamptz not null default now()
);
comment on table public.bases_normas is 'Catálogo de bases de normas (= domínios de knowledge/dominios) para o implantador escolher.';
comment on column public.bases_normas.id is 'Id do domínio, ex.: planejamento-urbano.';
comment on column public.bases_normas.transversal is 'Entra automaticamente em todo agente (ex.: governo-digital).';
comment on column public.bases_normas.guia is 'Markdown do guia do domínio: tipos de processo, normas e o que perguntar ao servidor.';
comment on column public.bases_normas.disponivel is 'false = saiu do knowledge/, mas ainda há agente usando.';

create table public.normas (
  base_id      text not null references public.bases_normas (id) on delete cascade,
  id           text not null,
  titulo       text not null,
  tipo         text not null,
  numero       text not null,
  ano          integer not null,
  esfera       text not null,
  ementa       text,
  url          text,
  abrangencia  text,
  tags         text[] not null default '{}',
  relevancia   text not null default '',
  texto        text not null default '',
  primary key (base_id, id)
);
comment on column public.normas.id is 'Id da norma, ex.: lei-6766-1979.';
comment on column public.normas.relevancia is 'Seção "Relevância para a implantação": o que a norma muda no processo, com artigos.';
comment on column public.normas.texto is 'Texto integral (informativo; a publicação oficial está em url).';

create table public.agentes (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes (id) on delete cascade,
  nome           text not null,
  whatsapp       text unique,
  status         public.status_agente not null default 'draft',
  criado_por     uuid references public.usuarios (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint agentes_ativo_tem_whatsapp check (status <> 'active' or whatsapp is not null)
);
comment on table public.agentes is 'Agente de WhatsApp de uma prefeitura, com as bases de normas que pode consultar.';
comment on column public.agentes.whatsapp is 'Número em que o agente atende, E.164 (+5551999998888).';

create table public.agente_bases (
  agente_id  uuid not null references public.agentes (id) on delete cascade,
  base_id    text not null references public.bases_normas (id),
  origem     public.origem_base_agente not null default 'selecionada',
  primary key (agente_id, base_id)
);
comment on table public.agente_bases is 'Bases do agente: as escolhidas pelo implantador e as transversais (automatica).';

alter table public.conversas
  add column agente_id uuid references public.agentes (id) on delete set null;
comment on column public.conversas.agente_id is 'Agente que atende a conversa de WhatsApp.';

-- ---------- Índices ----------

create index normas_base_id_idx on public.normas (base_id);
create index agentes_cliente_id_idx on public.agentes (cliente_id);
create index agentes_criado_por_idx on public.agentes (criado_por);
create index agente_bases_base_id_idx on public.agente_bases (base_id);
create index conversas_agente_id_idx on public.conversas (agente_id);

-- ---------- Triggers ----------

create trigger agentes_atualizado_em before update on public.agentes
  for each row execute function public.definir_atualizado_em();

-- ---------- RLS ----------

alter table public.bases_normas enable row level security;
alter table public.normas enable row level security;
alter table public.agentes enable row level security;
alter table public.agente_bases enable row level security;
