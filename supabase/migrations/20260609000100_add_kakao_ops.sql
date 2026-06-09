create table if not exists public.kakao_rooms (
  id uuid primary key default gen_random_uuid(),
  room_key text not null unique,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kakao_people (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.kakao_rooms(id) on delete cascade,
  first_nickname text not null,
  current_nickname text not null,
  join_count integer not null default 0,
  leave_count integer not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kakao_aliases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.kakao_people(id) on delete cascade,
  room_id uuid not null references public.kakao_rooms(id) on delete cascade,
  nickname text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, person_id, nickname)
);

create table if not exists public.kakao_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.kakao_rooms(id) on delete cascade,
  person_id uuid references public.kakao_people(id) on delete set null,
  event_type text not null check (event_type in ('join', 'leave', 'rename', 'message')),
  nickname text,
  old_nickname text,
  new_nickname text,
  message_text text,
  suspicion_candidates jsonb not null default '[]'::jsonb,
  source text not null default 'notification',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.kakao_notes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.kakao_rooms(id) on delete cascade,
  person_id uuid not null references public.kakao_people(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 1000),
  severity text not null default 'info' check (severity in ('info', 'watch', 'block')),
  created_by text not null default 'bot',
  created_at timestamptz not null default now()
);

create index if not exists kakao_people_room_current_idx
  on public.kakao_people (room_id, current_nickname);

create index if not exists kakao_aliases_room_nickname_idx
  on public.kakao_aliases (room_id, nickname);

create index if not exists kakao_events_room_type_time_idx
  on public.kakao_events (room_id, event_type, occurred_at desc);

drop trigger if exists kakao_rooms_touch_updated_at on public.kakao_rooms;
create trigger kakao_rooms_touch_updated_at
before update on public.kakao_rooms
for each row execute function public.touch_updated_at();

drop trigger if exists kakao_people_touch_updated_at on public.kakao_people;
create trigger kakao_people_touch_updated_at
before update on public.kakao_people
for each row execute function public.touch_updated_at();

alter table public.kakao_rooms enable row level security;
alter table public.kakao_people enable row level security;
alter table public.kakao_aliases enable row level security;
alter table public.kakao_events enable row level security;
alter table public.kakao_notes enable row level security;

drop policy if exists "kakao rooms readable by authenticated users" on public.kakao_rooms;
create policy "kakao rooms readable by authenticated users"
on public.kakao_rooms for select
to authenticated
using (true);

drop policy if exists "kakao people readable by authenticated users" on public.kakao_people;
create policy "kakao people readable by authenticated users"
on public.kakao_people for select
to authenticated
using (true);

drop policy if exists "kakao aliases readable by authenticated users" on public.kakao_aliases;
create policy "kakao aliases readable by authenticated users"
on public.kakao_aliases for select
to authenticated
using (true);

drop policy if exists "kakao events readable by authenticated users" on public.kakao_events;
create policy "kakao events readable by authenticated users"
on public.kakao_events for select
to authenticated
using (true);

drop policy if exists "kakao notes readable by authenticated users" on public.kakao_notes;
create policy "kakao notes readable by authenticated users"
on public.kakao_notes for select
to authenticated
using (true);
