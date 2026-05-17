create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 20),
  hp integer not null default 100 check (hp between 0 and 100),
  status text not null default '정상',
  is_admin boolean not null default false,
  inventory jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  settings jsonb not null default jsonb_build_object(
    'auto_events', false,
    'event_interval_minutes', 60,
    'event_prompt', '현대 한국 배경의 심심풀이 생존 TRPG 이벤트를 만들어줘.'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null,
  scene text not null,
  stakes text not null,
  tone text not null,
  active boolean not null default true,
  log jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nickname text not null default 'GM',
  kind text not null check (kind in ('chat', 'gm', 'event', 'system')),
  text text not null check (char_length(text) between 1 and 2000),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists rooms_touch_updated_at on public.rooms;
create trigger rooms_touch_updated_at
before update on public.rooms
for each row execute function public.touch_updated_at();

insert into public.rooms (slug, title)
values ('main', '기본 세션')
on conflict (slug) do nothing;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.events enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users create own profile" on public.profiles;
create policy "users create own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles"
on public.profiles for update
to authenticated
using (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

drop policy if exists "admins delete profiles" on public.profiles;
create policy "admins delete profiles"
on public.profiles for delete
to authenticated
using (
  id <> auth.uid()
  and exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

drop policy if exists "rooms are readable" on public.rooms;
create policy "rooms are readable"
on public.rooms for select
to authenticated
using (true);

drop policy if exists "authenticated users update room settings" on public.rooms;
drop policy if exists "admins update room settings" on public.rooms;
create policy "admins update room settings"
on public.rooms for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_admin = true
  )
);

drop policy if exists "events are readable" on public.events;
create policy "events are readable"
on public.events for select
to authenticated
using (true);

drop policy if exists "messages are readable" on public.messages;
create policy "messages are readable"
on public.messages for select
to authenticated
using (true);

drop policy if exists "users insert own chat messages" on public.messages;
create policy "users insert own chat messages"
on public.messages for insert
to authenticated
with check (kind = 'chat' and auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
