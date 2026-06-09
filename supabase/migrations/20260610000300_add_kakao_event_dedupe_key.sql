alter table public.kakao_events
  add column if not exists dedupe_key text;

create unique index if not exists kakao_events_dedupe_key_idx
  on public.kakao_events (dedupe_key)
  where dedupe_key is not null;
