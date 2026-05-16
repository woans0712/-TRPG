# Supabase 아주 쉬운 연결 순서

아래 4단계만 하면 됩니다.

## 1. 프로젝트 만들기

1. https://supabase.com 접속
2. 로그인
3. `New project` 클릭
4. Organization 선택
5. Project name 입력
   - 예: `trpg-simulator`
6. Database Password 입력
   - 아무거나 강한 비밀번호로 만들고 따로 적어두기
7. Region 선택
   - 한국이면 Northeast Asia 쪽이 있으면 선택
8. `Create new project` 클릭

프로젝트 생성은 몇 분 걸릴 수 있습니다.

## 2. 이메일 확인 끄기

닉네임/비밀번호 방식으로 바로 로그인하려면 이 설정이 중요합니다.

1. 왼쪽 메뉴에서 `Authentication`
2. `Providers`
3. `Email`
4. `Confirm email` 끄기
5. 저장

## 3. DB 만들기

1. 왼쪽 메뉴에서 `SQL Editor`
2. `New query`
3. 이 파일 열기: `supabase/schema.sql`
4. 내용을 전부 복사
5. Supabase SQL Editor에 붙여넣기
6. `Run` 클릭

오류 없이 끝나면 DB 준비 완료입니다.

## 4. 웹앱 키 넣기

1. 왼쪽 아래 톱니바퀴 `Project Settings`
2. `API`
3. 아래 2개 복사
   - `Project URL`
   - `anon public`
4. `public/supabase-config.js` 파일을 열고 아래처럼 바꾸기

```js
window.TRPG_SUPABASE_URL = "여기에 Project URL";
window.TRPG_SUPABASE_ANON_KEY = "여기에 anon public key";
```

## 여기까지 하면 기본 로그인/채팅 준비 완료

이 다음은 내가 도와줄 수 있습니다.

나한테 아래 3개를 알려주면 Edge Function 배포 명령을 이어서 진행할 수 있습니다.

```text
Project Ref:
Project URL:
anon public key:
```

GPT까지 연결하려면 OpenAI API 키도 필요합니다.

```text
OPENAI_API_KEY:
```

Project Ref는 Supabase 프로젝트 URL에 있는 짧은 ID입니다.

예:

```text
https://abcdefghijklmnop.supabase.co
```

이면 Project Ref는:

```text
abcdefghijklmnop
```
