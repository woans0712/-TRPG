# 배포 체크리스트

내가 미리 해둔 것:

- GitHub Pages Actions 배포 설정 추가: `.github/workflows/pages.yml`
- Supabase CLI 설정 추가: `supabase/config.toml`
- Supabase DB SQL 작성: `supabase/schema.sql`
- Edge Functions 작성: `supabase/functions/start-event`, `supabase/functions/judge-action`
- 정적 웹앱 작성: `public/`

## 네가 직접 해야 하는 것

### 1. 설치

이 PC에는 현재 `git`과 `supabase` 명령어가 없습니다.

설치해야 할 것:

- Git for Windows
- Supabase CLI

### 2. Supabase 프로젝트

1. Supabase에서 새 프로젝트 생성
2. Authentication > Providers > Email에서 Confirm email 끄기
3. SQL Editor에서 `supabase/schema.sql` 실행
4. Project Settings > API에서 Project URL과 anon public key 복사
5. `public/supabase-config.js`에 두 값을 입력

`public/supabase-config.example.js`는 예시 파일입니다. 실제 앱은 `public/supabase-config.js`를 읽습니다.

### 3. Supabase 함수 배포

```powershell
supabase login
supabase link --project-ref 프로젝트ID
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
supabase functions deploy start-event
supabase functions deploy judge-action
```

### 4. GitHub 업로드

GitHub에 새 저장소를 만들고 이 폴더를 업로드합니다.

```powershell
git init
git add .
git commit -m "Initial TRPG simulator"
git branch -M main
git remote add origin https://github.com/깃허브아이디/저장소이름.git
git push -u origin main
```

### 5. GitHub Pages 켜기

Repository Settings > Pages에서 Source를 `GitHub Actions`로 선택합니다.

이후 main 브랜치에 push하면 `.github/workflows/pages.yml`이 `public/` 폴더를 배포합니다.
