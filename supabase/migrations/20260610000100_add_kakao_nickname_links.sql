create table if not exists public.kakao_message_fingerprints (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.kakao_rooms(id) on delete cascade,
  fingerprint text not null,
  nickname text not null,
  message_text text not null,
  occurred_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, fingerprint, nickname)
);

create table if not exists public.kakao_nickname_links (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.kakao_rooms(id) on delete cascade,
  old_nickname text not null,
  new_nickname text not null,
  fingerprint text not null,
  message_text text not null,
  occurred_at timestamptz not null,
  reason text not null default 'same_message_fingerprint',
  created_at timestamptz not null default now(),
  unique (room_id, old_nickname, new_nickname, fingerprint)
);

create index if not exists kakao_message_fingerprints_room_fingerprint_idx
  on public.kakao_message_fingerprints (room_id, fingerprint);

create index if not exists kakao_nickname_links_room_new_idx
  on public.kakao_nickname_links (room_id, new_nickname, created_at desc);

create index if not exists kakao_nickname_links_room_old_idx
  on public.kakao_nickname_links (room_id, old_nickname, created_at desc);

alter table public.kakao_message_fingerprints enable row level security;
alter table public.kakao_nickname_links enable row level security;

drop policy if exists "kakao message fingerprints readable by authenticated users" on public.kakao_message_fingerprints;
create policy "kakao message fingerprints readable by authenticated users"
on public.kakao_message_fingerprints for select
to authenticated
using (true);

drop policy if exists "kakao nickname links readable by authenticated users" on public.kakao_nickname_links;
create policy "kakao nickname links readable by authenticated users"
on public.kakao_nickname_links for select
to authenticated
using (true);
