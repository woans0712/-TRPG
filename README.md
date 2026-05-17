# 뚜비의 강화 공방

GitHub Pages와 Supabase로 돌아가는 강화 시뮬레이터입니다.

현재 판은 GPT와 실시간 채팅을 쓰지 않습니다. 유저가 강화 버튼을 누르면 브라우저에서 즉시 결과가 나오고, 진행 상태는 Supabase 프로필 데이터에 저장됩니다.

## 구조

- GitHub Pages 정적 배포 구조: `public/`
- Supabase 공개 연결 설정: `public/supabase-config.js`
- 강화 밸런스 데이터: `public/game-data.js`
- 로그인/저장용 DB 스키마: `supabase/`
- Supabase 배포 스크립트: `scripts/`

## 밸런스 수정

강화 확률, 비용, 쿨타임, 시작 자원, 실패 페널티는 [public/game-data.js](public/game-data.js)에서 수정합니다.

자주 만질 값:

- `startingState.attempts`: 처음 지급되는 기회
- `attempt.max`: 최대 기회
- `attempt.cooldownSeconds`: 기회 1개가 회복되는 시간
- `levels[].success`: 단계별 성공 확률
- `levels[].cost`: 단계별 골드 비용
- `levels[].shards`: 단계별 파편 비용
- `levels[].fail`: 실패 결과
- `levels[].destroyChance`: 실패했을 때 추가로 파괴될 확률

실패 결과 종류:

- `keep`: 변화 없음
- `downgrade`: 1단계 하락
- `crack`: 2단계 하락
- `destroy`: +0으로 복구

## 배포

프론트엔드만 바꿨을 때는 GitHub에 push하면 GitHub Pages가 자동 배포합니다.

Supabase 함수가 바뀌었을 때만 사용자 PC의 PowerShell에서 실행합니다.

```powershell
cd D:\progr\ee
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\deploy-supabase-functions.ps1
```

DB 스키마가 바뀌었을 때만 다음을 실행합니다.

```powershell
.\scripts\apply-supabase-db.ps1
```
