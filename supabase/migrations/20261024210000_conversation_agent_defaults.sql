-- A backend-configured routing default for the web interview, separate from WhatsApp activation.
create table public.conversation_agent_defaults (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  dominio text not null references public.bases_normas(id) on delete cascade,
  agente_id uuid not null references public.agentes(id) on delete cascade,
  primary key (cliente_id, dominio)
);
alter table public.conversation_agent_defaults enable row level security;
