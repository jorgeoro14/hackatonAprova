-- Approval is independent of municipal confirmation and bound to an immutable snapshot.
create table public.implementer_form_approvals (
  id uuid primary key default gen_random_uuid(),
  formulario_id uuid not null references public.formularios(id) on delete cascade,
  revision integer not null check (revision >= 1),
  actor_id uuid not null references public.usuarios(id),
  approval_text text not null check (length(trim(approval_text)) > 0),
  snapshot jsonb not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  approved_at timestamptz not null default now(),
  unique (formulario_id, revision, actor_id)
);
alter table public.implementer_form_approvals enable row level security;
