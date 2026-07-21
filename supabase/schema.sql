create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  username text,
  password_hash text,
  role text not null default 'user' check (role in ('user', 'admin')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration helpers for existing installs.
alter table public.users add column if not exists email text;
alter table public.users add column if not exists username text;
alter table public.users add column if not exists password_hash text;
alter table public.users add column if not exists role text not null default 'user';
alter table public.users add column if not exists email_verified_at timestamptz;
alter table public.users add column if not exists created_at timestamptz not null default now();
alter table public.users add column if not exists updated_at timestamptz not null default now();
alter table public.users alter column role set default 'user';

do $$
begin
  alter table public.users add constraint users_role_check check (role in ('user', 'admin'));
exception
  when duplicate_object then null;
end;
$$;

create unique index if not exists users_email_unique_idx on public.users (email);
create unique index if not exists users_username_lower_unique_idx on public.users (lower(username)) where username is not null;
create index if not exists users_created_at_idx on public.users (created_at desc);

alter table public.users enable row level security;
revoke all on table public.users from anon, authenticated;
grant select, insert, update, delete on table public.users to service_role;

create table if not exists public.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  username text,
  code_hash text not null,
  password_hash text,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Migration helpers for existing installs.
alter table public.email_verification_codes add column if not exists email text;
alter table public.email_verification_codes add column if not exists username text;
alter table public.email_verification_codes add column if not exists code_hash text;
alter table public.email_verification_codes add column if not exists password_hash text;
alter table public.email_verification_codes add column if not exists attempts integer not null default 0;
alter table public.email_verification_codes add column if not exists expires_at timestamptz;
alter table public.email_verification_codes add column if not exists consumed_at timestamptz;
alter table public.email_verification_codes add column if not exists created_at timestamptz not null default now();

alter table public.email_verification_codes enable row level security;
revoke all on table public.email_verification_codes from anon, authenticated;
grant select, insert, update, delete on table public.email_verification_codes to service_role;

create index if not exists email_verification_codes_pending_idx
  on public.email_verification_codes (email, created_at desc)
  where consumed_at is null;
create index if not exists email_verification_codes_expires_at_idx
  on public.email_verification_codes (expires_at);

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users(id) on delete set null,
  name text not null,
  extension text not null check (extension in ('lua', 'txt')),
  content text not null,
  token_hash text not null,
  is_encrypted boolean not null default true,
  hits bigint not null default 0,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration helpers for existing installs.
alter table public.scripts add column if not exists token_hash text;
alter table public.scripts add column if not exists owner_user_id uuid references public.users(id) on delete set null;
alter table public.scripts add column if not exists is_encrypted boolean not null default true;
alter table public.scripts add column if not exists last_accessed_at timestamptz;
alter table public.scripts add column if not exists hits bigint not null default 0;
alter table public.scripts add column if not exists expires_at timestamptz;
alter table public.scripts add column if not exists created_at timestamptz not null default now();
alter table public.scripts add column if not exists updated_at timestamptz not null default now();
alter table public.scripts alter column is_encrypted set default true;

-- Compatibility with older versions.
alter table public.scripts add column if not exists secret_slug text;
alter table public.scripts alter column secret_slug drop not null;

update public.scripts
set token_hash = encode(digest(coalesce(secret_slug, id::text), 'sha256'), 'hex')
where token_hash is null or token_hash = '';

alter table public.scripts alter column token_hash set not null;
alter table public.scripts drop column if exists secret_slug;

alter table public.scripts enable row level security;

-- No public policies on purpose.
-- Only the server-side Supabase service role key should read/write this table.
revoke all on table public.scripts from anon, authenticated;
grant select, insert, update, delete on table public.scripts to service_role;

create unique index if not exists scripts_token_hash_unique_idx on public.scripts (token_hash);
create index if not exists scripts_created_at_idx on public.scripts (created_at desc);
create index if not exists scripts_owner_user_id_idx on public.scripts (owner_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scripts_set_updated_at on public.scripts;
create trigger scripts_set_updated_at
before update on public.scripts
for each row execute function public.set_updated_at();

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create table if not exists public.rate_limits (
  limit_key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;

create index if not exists rate_limits_reset_at_idx on public.rate_limits (reset_at);

create or replace function public.hit_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  if p_key is null or length(trim(p_key)) = 0 or p_limit < 1 or p_window_seconds < 1 then
    return true;
  end if;

  delete from public.rate_limits
  where reset_at <= v_now - interval '5 minutes';

  insert into public.rate_limits as rl (limit_key, count, reset_at)
  values (left(p_key, 256), 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (limit_key) do update
    set count = case
        when rl.reset_at <= v_now then 1
        else rl.count + 1
      end,
      reset_at = case
        when rl.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
        else rl.reset_at
      end
  returning count into v_count;

  return v_count > p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- Atomic hit counter for /raw script loads. Avoids the read-modify-write
-- race in application code that loses hits under concurrent requests.
create or replace function public.increment_script_hits(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.scripts
  set hits = hits + 1,
      last_accessed_at = now()
  where id = p_id;
$$;

revoke all on function public.increment_script_hits(uuid) from public, anon, authenticated;
grant execute on function public.increment_script_hits(uuid) to service_role;
