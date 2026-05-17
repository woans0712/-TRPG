# 뚜비의 강화 공방

GitHub Pages와 Supabase로 돌아가는 강화 시뮬레이터입니다.

현재 판은 GPT와 실시간 채팅을 쓰지 않습니다. 유저가 강화 버튼을 누르면 브라우저에서 즉시 결과가 나오고, 진행 상태는 Supabase 프로필 데이터에 저장됩니다.

## 수정할 파일

게임 밸런스와 문구는 [public/backend-data.js](public/backend-data.js) 하나에서 관리합니다.

자주 만질 값:

- `storage.saveKey`: Supabase 프로필에 저장되는 게임 데이터 이름
- `auth`: 닉네임 로그인용 내부 이메일 규칙
- `game.item`: 장비 이름, 종류, 설명, 최대 강화 단계
- `game.startingState`: 시작 강화 단계, 기회, 파괴 상태
- `game.attempt.max`: 최대 기회
- `game.attempt.cooldownSeconds`: 기회 1개가 회복되는 시간
- `game.gradeLabels`: 단계 상태 문구
- `game.levels[].success`: 단계별 성공 확률
- `game.levels[].fail`: 실패 결과
- `game.levels[].destroyChance`: 실패했을 때 추가로 파괴될 확률
- `game.messages`: 성공/실패/파괴 문구

실패 결과 종류:

- `keep`: 변화 없음
- `downgrade`: 1단계 하락
- `crack`: 2단계 하락
- `destroy`: +0으로 복구

## 배포

프론트엔드만 바꿨을 때는 GitHub에 push하면 GitHub Pages가 자동 배포합니다.

관리자 유저 목록, 다른 유저 초기화, 다른 유저 삭제 권한은 DB 정책이 필요합니다. 이 기능을 반영할 때는 DB 스키마도 적용해야 합니다.

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
