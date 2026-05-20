// 강화 게임 설정 파일입니다.
// 숫자와 문구를 바꾼 뒤 저장하면 게임 밸런스가 바뀝니다.
// 주의: 왼쪽 영어 이름은 앱이 읽는 이름이라 지우면 안 됩니다.

window.ENHANCE_BACKEND_DATA = {
  // 데이터 버전입니다. 크게 구조를 갈아엎을 때만 올리면 됩니다.
  version: 1,

  // 저장 관련 설정입니다.
  storage: {
    saveKey: "enhanceWorkshop", // Supabase 프로필 안에 저장되는 게임 데이터 이름
    localPrefix: "enhanceWorkshop:", // 브라우저 임시 저장 이름 앞부분
    syncDebounceMs: 350, // 서버 저장을 몇 ms 늦게 묶어서 보낼지
  },

  // 닉네임/비밀번호 로그인을 내부 이메일로 바꾸는 규칙입니다.
  // 기존 유저 호환 때문에 보통 건드리지 않는 게 좋습니다.
  auth: {
    primaryPrefix: "trpg", // 기본 내부 이메일 앞부분
    primaryDomain: "trpgsim.app", // 기본 내부 이메일 도메인
    fallbackPrefix: "enhance", // 예전/다른 규칙 호환용 앞부분
    fallbackDomain: "ddubbi-sim.app", // 예전/다른 규칙 호환용 도메인
  },

  game: {
    // 장비 기본 정보입니다.
    item: {
      name: "낡은 심심검", // 장비 이름
      type: "수상한 한손검", // 장비 종류
      flavor: "강화할수록 묘하게 눈치가 보이는 검.", // 장비 설명
      maxLevel: 15, // 최대 강화 단계
    },

    // 새 유저 또는 관리자 초기화 시 시작 상태입니다.
    startingState: {
      level: 0, // 시작 강화 단계
      attempts: 10, // 시작 기회
      bestLevel: 0, // 시작 최고 기록
      destroyed: false, // 시작 시 파괴 상태 여부
    },

    // 기회 관련 설정입니다.
    attempt: {
      max: 10, // 기회 최대치
      cooldownSeconds: 45, // 기회 1개 회복에 걸리는 시간(초)
    },

    // 강화 기록 관련 설정입니다.
    history: {
      retentionDays: 2, // 며칠 지난 기록을 삭제할지
      scrollAfter: 5, // 기록이 몇 개 이상이면 스크롤로 바꿀지
      maxStored: 50, // 최대 몇 개까지 저장할지
    },

    // 강화 단계에 따라 장비 빛 색상을 바꾸는 설정입니다.
    // text는 지금 화면에 표시하지 않지만, 나중에 다시 쓸 수 있게 남겨둡니다.
    gradeLabels: [
      { minLevel: 12, text: "붕괴권", grade: "legend" },
      { minLevel: 10, text: "위험", grade: "rare" },
      { minLevel: 5, text: "불안정", grade: "fine" },
      { minLevel: 0, text: "안정", grade: "plain" },
    ],

    // 단계별 강화 확률표입니다.
    // level: 현재 강화 단계
    // success: 성공 확률(%)
    // fail: 실패했을 때 결과
    // destroyChance: 실패했을 때 추가로 파괴될 확률(%)
    //
    // fail 종류:
    // keep = 변화 없음
    // downgrade = 1단계 하락
    // crack = 2단계 하락
    levels: [
      { level: 0, success: 95, fail: "keep", destroyChance: 0 },
      { level: 1, success: 90, fail: "keep", destroyChance: 0 },
      { level: 2, success: 84, fail: "keep", destroyChance: 0 },
      { level: 3, success: 76, fail: "keep", destroyChance: 0 },
      { level: 4, success: 68, fail: "keep", destroyChance: 0 },
      { level: 5, success: 58, fail: "downgrade", destroyChance: 0 },
      { level: 6, success: 49, fail: "downgrade", destroyChance: 0 },
      { level: 7, success: 40, fail: "downgrade", destroyChance: 0 },
      { level: 8, success: 32, fail: "downgrade", destroyChance: 0 },
      { level: 9, success: 25, fail: "downgrade", destroyChance: 0 },
      { level: 10, success: 18, fail: "crack", destroyChance: 6 },
      { level: 11, success: 13, fail: "crack", destroyChance: 10 },
      { level: 12, success: 9, fail: "crack", destroyChance: 18 },
      { level: 13, success: 6, fail: "crack", destroyChance: 28 },
      { level: 14, success: 3, fail: "crack", destroyChance: 40 },
    ],

    // 강화 결과 문구입니다.
    // 같은 결과 안에서 랜덤으로 하나가 표시됩니다.
    messages: {
      success: [
        "망치 소리가 맑게 울리고 장비가 한 단계 살아났다.",
        "불꽃이 짧게 튀었다. 이번에는 운이 네 편이었다.",
        "장비 표면의 균열이 빛으로 메워졌다.",
      ],
      keep: [
        "불꽃은 튀었지만 장비는 버텼다. 달라진 건 없다.",
        "강화석이 가루가 됐다. 장비는 조용히 모른 척했다.",
      ],
      downgrade: [
        "금속이 찌그러지며 강화 단계가 한 칸 밀렸다.",
        "망치가 빗나갔다. 장비의 기세가 한 단계 꺾였다.",
      ],
      crack: [
        "날카로운 균열이 번졌다. 두 단계가 한꺼번에 무너졌다.",
        "공방 안이 조용해졌다. 장비가 크게 손상됐다.",
      ],
      destroy: [
        "한순간 빛이 꺼졌다. 장비는 파괴됐고 +0으로 다시 주조됐다.",
        "너무 깊게 밀어붙였다. 남은 건 새로 식힌 검뿐이다.",
      ],
      max: "이미 최대 강화에 도달했다.",
    },
  },
};
