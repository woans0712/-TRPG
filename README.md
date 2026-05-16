# 심심풀이 TRPG 시뮬레이터

GitHub Pages + Supabase로 운영하는 웹 TRPG 시뮬레이터입니다.

친구들은 같은 와이파이에 있을 필요 없이 GitHub Pages 주소로 접속합니다. 화면은 GitHub Pages가 제공하고, 로그인/DB/실시간 채팅/GPT GM 호출은 Supabase가 담당합니다.

## 구조

- `public/`: GitHub Pages에 올라갈 정적 웹앱
- `supabase/schema.sql`: Supabase DB 테이블, RLS, Realtime 설정
- `supabase/functions/start-event`: GPT로 새 이벤트 생성
- `supabase/functions/judge-action`: 플레이어 행동 판정
- `server.py`: 예전 로컬 테스트용 서버. GitHub Pages 방식에서는 필수가 아닙니다.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 새 프로젝트를 만듭니다.
2. Project Settings > API에서 아래 값을 확인합니다.
   - Project URL
   - anon public key
3. Authentication > Providers > Email에서 Confirm email을 꺼둡니다.

Confirm email이 켜져 있으면 가짜 이메일 방식의 닉네임 로그인이 바로 완료되지 않습니다.

## 2. DB 스키마 적용

Supabase Dashboard > SQL Editor에서 [supabase/schema.sql](supabase/schema.sql) 내용을 실행합니다.

이 SQL은 아래를 만듭니다.

- 프로필
- 기본 세션 방
- 이벤트
- 채팅 메시지
- Row Level Security 정책
- Realtime 구독 설정

## 3. 웹앱에 Supabase 키 입력

[public/supabase-config.js](public/supabase-config.js)를 열고 값을 바꿉니다.

```js
window.TRPG_SUPABASE_URL = "https://프로젝트ID.supabase.co";
window.TRPG_SUPABASE_ANON_KEY = "Supabase anon public key";
```

anon key는 브라우저에 공개되는 키입니다. Supabase RLS 정책을 제대로 켜두는 것이 중요합니다.

## 4. Edge Functions 배포

Supabase CLI를 설치한 뒤 로그인합니다.

```powershell
supabase login
supabase link --project-ref 프로젝트ID
```

OpenAI 키를 Supabase 비밀값으로 넣습니다.

```powershell
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

함수를 배포합니다.

```powershell
supabase functions deploy start-event
supabase functions deploy judge-action
```

OpenAI 키가 없으면 함수 안의 기본 로컬 GM 규칙으로 동작합니다.

## 5. 로컬에서 화면만 테스트

정적 파일 서버를 켭니다.

```powershell
cd D:\progr\ee\public
python -m http.server 8787
```

브라우저에서 접속합니다.

```text
http://127.0.0.1:8787
```

## 6. GitHub Pages 배포

1. GitHub에 새 저장소를 만듭니다.
2. 이 프로젝트를 업로드합니다.
3. Repository Settings > Pages로 이동합니다.
4. Source를 `GitHub Actions`로 선택합니다.
5. main 브랜치에 push하면 `.github/workflows/pages.yml`이 `public/` 폴더를 배포합니다.

배포 후 주소는 보통 아래 형태입니다.

```text
https://깃허브아이디.github.io/저장소이름/
```

세부 체크리스트는 [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md)를 참고하세요.

## 현재 기능

- 닉네임/비밀번호 가입 및 로그인
- Supabase Auth 기반 세션 유지
- 공동 채팅형 행동 입력
- Realtime 기반 실시간 메시지 갱신
- 현재 이벤트 표시
- GPT Edge Function 기반 이벤트 생성
- GPT Edge Function 기반 행동 판정
- HP/상태 표시
- PC/모바일 반응형 화면

## 다음 개선 후보

- 방 만들기와 초대 코드
- GM 관리자 권한
- 자동 이벤트 스케줄러
- 캐릭터 스탯과 판정 주사위
- 이벤트 종료/요약/로그 보관
