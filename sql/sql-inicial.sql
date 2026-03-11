-- Extensão para UUID aleatório
create extension if not exists pgcrypto;

-- =========================
-- TABELA DE PERFIS
-- =========================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text not null unique,
  role text not null default 'solicitante'
    check (role in ('solicitante', 'supervisor', 'diretor', 'admin')),
  departamento text,
  created_at timestamptz not null default now()
);

-- =========================
-- SOLICITAÇÕES
-- =========================
create table public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  solicitante_id uuid not null references public.profiles(id) on delete restrict,
  valor numeric(15,2) check (valor is null or valor >= 0),
  categoria text,
  urgencia text not null default 'normal'
    check (urgencia in ('baixa', 'normal', 'alta')),
  status text not null default 'pendente_supervisor'
    check (status in (
      'pendente_supervisor',
      'pendente_diretor',
      'aprovada',
      'rejeitada',
      'cancelada'
    )),

  supervisor_id uuid references public.profiles(id) on delete set null,
  supervisor_comentario text,
  supervisor_aprovado_em timestamptz,

  diretor_id uuid references public.profiles(id) on delete set null,
  diretor_comentario text,
  diretor_aprovado_em timestamptz,

  motivo_rejeicao text,
  rejeitado_em timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- NOTIFICAÇÕES
-- =========================
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  mensagem text not null,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================
-- HISTÓRICO
-- =========================
create table public.historico (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  usuario_id uuid references public.profiles(id) on delete set null,
  descricao text not null,
  created_at timestamptz not null default now()
);

-- =========================
-- ÍNDICES
-- =========================
create index idx_solicitacoes_solicitante_id on public.solicitacoes(solicitante_id);
create index idx_solicitacoes_supervisor_id on public.solicitacoes(supervisor_id);
create index idx_solicitacoes_diretor_id on public.solicitacoes(diretor_id);
create index idx_solicitacoes_status on public.solicitacoes(status);
create index idx_solicitacoes_created_at on public.solicitacoes(created_at desc);

create index idx_notificacoes_usuario_id on public.notificacoes(usuario_id);
create index idx_notificacoes_solicitacao_id on public.notificacoes(solicitacao_id);
create index idx_notificacoes_lida on public.notificacoes(lida);

create index idx_historico_solicitacao_id on public.historico(solicitacao_id);
create index idx_historico_usuario_id on public.historico(usuario_id);

-- =========================
-- TRIGGER updated_at
-- =========================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at_solicitacoes on public.solicitacoes;
create trigger trg_set_updated_at_solicitacoes
before update on public.solicitacoes
for each row
execute function public.set_updated_at();

-- =========================
-- TRIGGER DE CRIAÇÃO DE PROFILE
-- =========================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- =========================
-- RLS
-- =========================
alter table public.profiles enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.notificacoes enable row level security;
alter table public.historico enable row level security;

-- profiles: usuário vê e edita apenas o próprio perfil
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- solicitacoes: solicitante vê as próprias; aprovadores veem as atribuídas
create policy "solicitacoes_select_related"
on public.solicitacoes
for select
to authenticated
using (
  auth.uid() = solicitante_id
  or auth.uid() = supervisor_id
  or auth.uid() = diretor_id
);

create policy "solicitacoes_insert_own"
on public.solicitacoes
for insert
to authenticated
with check (auth.uid() = solicitante_id);

create policy "solicitacoes_update_related"
on public.solicitacoes
for update
to authenticated
using (
  auth.uid() = solicitante_id
  or auth.uid() = supervisor_id
  or auth.uid() = diretor_id
)
with check (
  auth.uid() = solicitante_id
  or auth.uid() = supervisor_id
  or auth.uid() = diretor_id
);

-- notificacoes: usuário vê apenas as próprias
create policy "notificacoes_select_own"
on public.notificacoes
for select
to authenticated
using (auth.uid() = usuario_id);

create policy "notificacoes_update_own"
on public.notificacoes
for update
to authenticated
using (auth.uid() = usuario_id)
with check (auth.uid() = usuario_id);

-- historico: ver histórico das solicitações relacionadas
create policy "historico_select_related"
on public.historico
for select
to authenticated
using (
  exists (
    select 1
    from public.solicitacoes s
    where s.id = historico.solicitacao_id
      and (
        s.solicitante_id = auth.uid()
        or s.supervisor_id = auth.uid()
        or s.diretor_id = auth.uid()
      )
  )
);