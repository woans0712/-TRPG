# Kakao Ops Bot

This backend stores only public chat-room events that the phone app can see in notifications.
It does not read KakaoTalk internal databases, hidden identifiers, account IDs, or device data.

## Deploy

```powershell
.\scripts\apply-supabase-db.ps1
.\scripts\set-kakao-bot-token.ps1
.\scripts\deploy-supabase-functions.ps1
```

## Endpoint

```text
POST https://<project-ref>.supabase.co/functions/v1/kakao-ops
Header: x-bot-token: <KAKAO_BOT_INGEST_TOKEN>
Header: content-type: application/json
```

## Ingest Events

Join:

```json
{
  "action": "ingest",
  "room_key": "main-openchat",
  "event_type": "join",
  "nickname": "배부른 춘식이",
  "occurred_at": "2026-06-09T10:00:00+09:00"
}
```

Leave:

```json
{
  "action": "ingest",
  "room_key": "main-openchat",
  "event_type": "leave",
  "nickname": "배부른 춘식이"
}
```

Rename:

```json
{
  "action": "ingest",
  "room_key": "main-openchat",
  "event_type": "rename",
  "old_nickname": "배부른 춘식이",
  "new_nickname": "긁적이는 춘식이"
}
```

Message:

```json
{
  "action": "ingest",
  "room_key": "main-openchat",
  "event_type": "message",
  "nickname": "긁적이는 춘식이",
  "message_text": "안녕하세요"
}
```

When a join is ingested, the response includes `suspicion_candidates` for recent leavers with similar nicknames.
Treat those as review hints, not confirmed identity.

## Lookup

```json
{
  "action": "lookup",
  "room_key": "main-openchat",
  "nickname": "춘식이"
}
```

The response contains:

- aliases
- join and leave counts
- nickname changes
- recent events
- admin notes

## Admin Notes

```json
{
  "action": "note",
  "room_key": "main-openchat",
  "nickname": "긁적이는 춘식이",
  "severity": "watch",
  "note": "관리자 확인 필요",
  "created_by": "admin"
}
```

## Manual Merge

Use this only after an admin confirms two records should be treated as the same public-history record.

```json
{
  "action": "merge",
  "source_person_id": "<old-person-id>",
  "target_person_id": "<kept-person-id>"
}
```

## Android Listener Shape

This repo includes a starter Android project in `android-kakao-listener/`.
The phone app uses `NotificationListenerService`, parses KakaoTalk notification text, and sends only the visible text-derived event.

Suggested parser mapping:

- `(.+)님이 들어왔습니다` -> `join`
- `(.+)님이 나갔습니다` -> `leave`
- `(.+)님이 (.+)님으로 변경되었습니다` -> `rename`
- message notification title/body -> `message`

Keep a local queue and retry failed requests so the bot does not lose events when the network is unstable.

## Build The Android App

Open `android-kakao-listener/` in Android Studio, then build/install the `app` module.

After installing:

1. Open the app.
2. Set `x-bot-token` to the same token saved by `scripts/set-kakao-bot-token.ps1`.
3. Keep the default endpoint unless the Supabase project changes.
4. Set `room_key` to a stable room name such as `main-openchat`.
5. Tap save.
6. Tap notification access settings and allow `Kakao Ops Listener`.
7. Send a test event from the app.

## Local Phone Database

The Android app now stores notification events in its own SQLite database before trying to sync to Supabase.
This database belongs to the listener app, not KakaoTalk.

Stored locally:

- room key
- event type
- nickname
- old/new nickname when available
- message text
- local created time
- whether the event was sent to Supabase

The app screen has `Show local DB summary` to check local room/event/unsent counts.

## Chat Commands

Commands are managed in `supabase/functions/kakao-ops/commands.ts`.
Edit that file when you want to add, remove, rename, or reword commands.

The Android app sends command text to the backend, then answers when KakaoTalk exposes a notification quick-reply action.
This depends on the phone, KakaoTalk notification style, and chat notification settings.

Supported commands:

```text
/도움
/조회 닉네임
/기록 닉네임
/닉변 닉네임
```

Command replies are generated from the same public notification history stored by `kakao-ops`.
