create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint device_push_tokens_token_key unique (token)
);

create index if not exists idx_device_push_tokens_user_id
  on public.device_push_tokens(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_device_push_tokens on public.device_push_tokens;

create trigger set_updated_at_device_push_tokens
before update on public.device_push_tokens
for each row
execute function public.set_updated_at();
