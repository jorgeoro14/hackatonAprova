-- Anexos enviados pela prefeitura no chat. O arquivo fica no disco (UPLOAD_DIR); aqui só os metadados.
-- Mesmas convenções: RLS ligado e sem policies (só o backend acessa).

create table public.anexos (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references public.conversas (id) on delete cascade,
  nome         text not null,
  mime         text not null,
  tamanho      integer not null check (tamanho >= 0),
  caminho      text not null,
  criado_em    timestamptz not null default now()
);
comment on column public.anexos.caminho is 'Nome do arquivo dentro de UPLOAD_DIR.';

create index anexos_conversa_id_idx on public.anexos (conversa_id);

alter table public.campos_processo
  add constraint campos_processo_anexo_origem_fk
  foreign key (anexo_origem_id) references public.anexos (id) on delete set null;

alter table public.anexos enable row level security;
