create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  role text default 'solicitante',
  departamento text,
  created_at timestamptz default now()
);

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  descricao text,
  solicitante_id uuid references public.profiles(id),
  valor numeric(15,2),
  categoria text,
  urgencia text default 'normal',
  status text default 'pendente',
  supervisor_id uuid references public.profiles(id),
  supervisor_comentario text,
  supervisor_aprovado_em timestamptz,
  diretor_id uuid references public.profiles(id),
  diretor_comentario text,
  diretor_aprovado_em timestamptz,
  motivo_rejeicao text,
  rejeitado_em timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id),
  solicitacao_id uuid references public.solicitacoes(id) on delete cascade,
  mensagem text,
  lida boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.historico (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid references public.solicitacoes(id) on delete cascade,
  usuario_id uuid references public.profiles(id),
  descricao text,
  created_at timestamptz default now()
);

create index if not exists idx_solicitacoes_solicitante_id on public.solicitacoes(solicitante_id);
create index if not exists idx_solicitacoes_supervisor_id on public.solicitacoes(supervisor_id);
create index if not exists idx_solicitacoes_diretor_id on public.solicitacoes(diretor_id);
create index if not exists idx_solicitacoes_status on public.solicitacoes(status);
create index if not exists idx_notificacoes_usuario_id on public.notificacoes(usuario_id);
create index if not exists idx_notificacoes_solicitacao_id on public.notificacoes(solicitacao_id);
create index if not exists idx_historico_solicitacao_id on public.historico(solicitacao_id);

alter table public.profiles disable row level security;
alter table public.solicitacoes disable row level security;
alter table public.notificacoes disable row level security;
alter table public.historico disable row level security;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, email)
  values (
    new.id,
    split_part(new.email, '@', 1),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

do $$
begin
  alter publication supabase_realtime add table public.notificacoes;
exception
  when duplicate_object then null;
end $$;
