insert into public.kakao_message_fingerprints (
  room_id,
  fingerprint,
  nickname,
  message_text,
  occurred_at,
  first_seen_at,
  last_seen_at
)
select
  room_id,
  to_char(date_trunc('minute', occurred_at at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI') || '|' || regexp_replace(trim(message_text), '\s+', ' ', 'g') as fingerprint,
  trim(nickname) as nickname,
  regexp_replace(trim(message_text), '\s+', ' ', 'g') as message_text,
  min(occurred_at) as occurred_at,
  min(created_at) as first_seen_at,
  max(created_at) as last_seen_at
from public.kakao_events
where event_type = 'message'
  and nullif(trim(nickname), '') is not null
  and nullif(trim(message_text), '') is not null
group by
  room_id,
  to_char(date_trunc('minute', occurred_at at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI') || '|' || regexp_replace(trim(message_text), '\s+', ' ', 'g'),
  trim(nickname),
  regexp_replace(trim(message_text), '\s+', ' ', 'g')
on conflict (room_id, fingerprint, nickname)
do update set last_seen_at = excluded.last_seen_at;

insert into public.kakao_nickname_links (
  room_id,
  old_nickname,
  new_nickname,
  fingerprint,
  message_text,
  occurred_at,
  reason
)
select
  older.room_id,
  older.nickname as old_nickname,
  newer.nickname as new_nickname,
  older.fingerprint,
  older.message_text,
  newer.occurred_at,
  'same_message_fingerprint' as reason
from public.kakao_message_fingerprints older
join public.kakao_message_fingerprints newer
  on newer.room_id = older.room_id
 and newer.fingerprint = older.fingerprint
 and newer.nickname <> older.nickname
 and newer.first_seen_at > older.first_seen_at
on conflict (room_id, old_nickname, new_nickname, fingerprint)
do nothing;
