# Kakao Ops Bot

This bot stores KakaoTalk OpenChat events that the Android listener app can legally see:
notifications, bot command messages, and chat export text files selected by the phone owner.

It does not read KakaoTalk internal DB files, hidden account IDs, app caches, or protected device data.

## Current Features

- KakaoTalk notification listener
- Local phone SQLite event queue
- Supabase sync
- Command replies through Kakao notification quick reply when available
- Kakao chat export `.txt` import from the Android app
- Nickname link detection by same room + same minute + same message text
- Duplicate prevention for repeated chat export imports

## Android App Flow

1. Open `Kakao Ops Listener`.
2. Save endpoint, token, and room key.
3. Allow notification access.
4. Tap `Import Kakao chat export`.
5. Select a KakaoTalk exported `.txt` file.
6. The app stores parsed messages locally and sends them to Supabase.

For nickname tracking, export the same room after the nickname changed and import that file again.
If old messages now appear with the new nickname, the backend links the old and new nicknames.

## Commands

Commands are edited in `supabase/functions/kakao-ops/commands.ts`.

```text
/도움
/조회 닉네임
/기록 닉네임
/닉변 닉네임
```

## Nickname Tracking Rule

The bot links nicknames only when it sees the same message again under another nickname:

```text
2026-06-10 03:34 / 뚜비 / 야호
2026-06-10 03:34 / 이지 / 야호
```

This creates a link:

```text
뚜비 -> 이지
reason: same_message_fingerprint
```

The comparison window is based on stored history, and lookup output shows detected nickname links.

## Deploy

```powershell
.\scripts\apply-supabase-db.ps1
.\scripts\deploy-supabase-functions.ps1
```

## Build Android

```powershell
cd android-kakao-listener
..\tools\gradle\gradle-8.7\bin\gradle.bat assembleDebug
```

APK:

```text
android-kakao-listener\app\build\outputs\apk\debug\app-debug.apk
```
