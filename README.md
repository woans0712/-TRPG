# 뚜비의 심심풀이

기존 TRPG 실험판을 정리하고 새 구조로 다시 만들기 위한 저장소입니다.

현재는 서버/API 연결 정보와 배포 도구만 남겨둔 리빌드 준비 상태입니다.

## 남겨둔 것

- GitHub Pages 정적 배포 구조: `public/`
- Supabase 공개 연결 설정: `public/supabase-config.js`
- Supabase DB 스키마와 마이그레이션: `supabase/`
- Supabase Edge Functions 소스: `supabase/functions/`
- OpenAI/Supabase 배포 스크립트: `scripts/`

## 다시 설계할 것

- 게임 진행 방식
- GPT 호출 타이밍
- 채팅/로그 저장 방식
- 플레이어 화면과 관리자 화면
- 속도 우선 구조

## 배포

프론트엔드만 바꿨을 때는 GitHub에 push하면 GitHub Pages가 자동 배포합니다.

Supabase 함수가 바뀌었을 때는 사용자 PC의 PowerShell에서 실행합니다.

```powershell
cd D:\progr\ee
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\deploy-supabase-functions.ps1
```

DB 스키마가 바뀌었을 때는 다음을 실행합니다.

```powershell
.\scripts\apply-supabase-db.ps1
```
