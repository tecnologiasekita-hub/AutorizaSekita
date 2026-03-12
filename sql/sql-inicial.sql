-- ============================================================
--  AutorizaSekita — Schema v2
--  Multi-diretor | Anexos | Histórico completo
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text,
  email         text,
  role          text default 'solicitante',
  departamento  text,
  created_at    timestamptz default now()
);

-- ------------------------------------------------------------
-- solicitacoes
-- ------------------------------------------------------------
create table if not exists public.solicitacoes (
  id                     uuid primary key default gen_random_uuid(),
  titulo                 text not null,
  descricao              text,
  solicitante_id         uuid references public.profiles(id),
  valor                  numeric(15,2) check (valor >= 0),
  categoria              text,
  urgencia               text default 'normal',
  status                 text default 'pendente',

  supervisor_id          uuid references public.profiles(id),
  supervisor_comentario  text,
  supervisor_aprovado_em timestamptz,

  rejeitado_por_id       uuid references public.profiles(id),
  rejeitado_por_role     text,
  motivo_rejeicao        text,
  rejeitado_em           timestamptz,

  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- ------------------------------------------------------------
-- solicitacao_diretores
-- ------------------------------------------------------------
create table if not exists public.solicitacao_diretores (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid references public.solicitacoes(id) on delete cascade,
  diretor_id     uuid references public.profiles(id),
  status         text default 'pendente',
  comentario     text,
  decidido_em    timestamptz,
  created_at     timestamptz default now(),
  unique (solicitacao_id, diretor_id)
);

-- ------------------------------------------------------------
-- anexos
-- ------------------------------------------------------------
create table if not exists public.anexos (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid references public.solicitacoes(id) on delete cascade,
  nome_arquivo   text not null,
  storage_path   text not null,
  mime_type      text,
  tamanho_bytes  bigint,
  uploaded_by    uuid references public.profiles(id),
  created_at     timestamptz default now()
);

-- ------------------------------------------------------------
-- historico
-- ------------------------------------------------------------
create table if not exists public.historico (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid references public.solicitacoes(id) on delete cascade,
  usuario_id     uuid references public.profiles(id),
  descricao      text,
  created_at     timestamptz default now()
);

-- ------------------------------------------------------------
-- notificacoes
-- ------------------------------------------------------------
create table if not exists public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid references public.profiles(id),
  solicitacao_id uuid references public.solicitacoes(id) on delete cascade,
  mensagem       text,
  lida           boolean default false,
  created_at     timestamptz default now()
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
create index if not exists idx_sol_solicitante on public.solicitacoes(solicitante_id);
create index if not exists idx_sol_supervisor  on public.solicitacoes(supervisor_id);
create index if not exists idx_sol_status      on public.solicitacoes(status);
create index if not exists idx_sol_dir_sol     on public.solicitacao_diretores(solicitacao_id);
create index if not exists idx_sol_dir_dir     on public.solicitacao_diretores(diretor_id);
create index if not exists idx_anexos_sol      on public.anexos(solicitacao_id);
create index if not exists idx_hist_sol        on public.historico(solicitacao_id);
create index if not exists idx_notif_usuario   on public.notificacoes(usuario_id);

-- ------------------------------------------------------------
-- RLS desabilitado
-- ------------------------------------------------------------
alter table public.profiles              disable row level security;
alter table public.solicitacoes          disable row level security;
alter table public.solicitacao_diretores disable row level security;
alter table public.anexos                disable row level security;
alter table public.historico             disable row level security;
alter table public.notificacoes          disable row level security;

-- ------------------------------------------------------------
-- Storage bucket para anexos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Trigger: auto-criar profile
-- ------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, split_part(new.email, '@', 1), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notificacoes;
exception when duplicate_object then null;
end $$;
