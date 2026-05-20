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
      cooldownSeconds: 600, // 기회 1개 회복에 걸리는 시간(초)
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
      { level: 0, name: "취직된 뚜비", success: 95, fail: "keep", destroyChance: 0 },
      { level: 1, name: "혼나는 뚜비", success: 90, fail: "keep", destroyChance: 0 },
      { level: 2, name: "야근 확정난 뚜비", success: 84, fail: "keep", destroyChance: 0 },
      { level: 3, name: "월급 들어온 뚜비", success: 76, fail: "keep", destroyChance: 0 },
      { level: 4, name: "회식 빠지는 뚜비", success: 68, fail: "keep", destroyChance: 0 },
      { level: 5, name: "법카 처음 받아본 뚜비", success: 58, fail: "downgrade", destroyChance: 0 },
      { level: 6, name: "후배 생긴 뚜비", success: 49, fail: "downgrade", destroyChance: 0 },
      { level: 7, name: "칼퇴 성공한 뚜비", success: 40, fail: "downgrade", destroyChance: 0 },
      { level: 8, name: "실세 뚜비", success: 32, fail: "downgrade", destroyChance: 0 },
      { level: 9, name: "연봉협상 이긴 뚜비", success: 25, fail: "downgrade", destroyChance: 0 },
      { level: 10, name: "회사 지분 있는 뚜비", success: 18, fail: "crack", destroyChance: 6 },
      { level: 11, name: "출근 안 해도 되는 뚜비", success: 13, fail: "crack", destroyChance: 1 },
      { level: 12, name: "건물 한채 있는 뚜비", success: 9, fail: "crack", destroyChance: 3 },
      { level: 13, name: "회장님이랑 밥먹는 뚜비", success: 6, fail: "crack", destroyChance: 5 },
      { level: 14, name: "회사 사버린 뚜비", success: 3, fail: "crack", destroyChance: 7 },
      { level: 15, name: "은퇴한 뚜비", success: 0, fail: "keep", destroyChance: 0 },
    ],

    // 강화 결과 문구입니다.
    // 같은 결과 안에서 랜덤으로 하나가 표시됩니다.
    messages: {
      success: [
        "용돈을 받았다!!!",
        "월급이 올랐다!!",
        "회식비를 아꼈다!",
        "치킨값이 생겼다!",
        "보너스를 받았다!",
        "팀장이 칭찬했다!",
        "오늘따라 운이 좋다!",
        "로또가 스쳤다!",
      ],
      keep: [
        "휴... 살았다.",
        "아무일도 없었다.",
        "간신히 버텼다...",
        "운이 따라줬다.",
        "고장날뻔했다!",
        "식은땀이 흘렀다.",
        "아슬아슬했다.",
      ],
      downgrade: [
        "커피를 쏘게됐다...",
        "월급루팡 실패!",
        "잔소리를 들었다.",
        "야근이 추가됐다.",
        "승진이 멀어졌다.",
        "지갑이 얇아졌다.",
        "뭔가 잘못됐다...",
        "분위기가 싸해졌다.",
      ],
      crack: [
        "멘탈이 흔들린다...",
        "수리비가 더 나온다!",
        "눈앞이 깜깜해졌다.",
        "손이 떨리기 시작했다.",
        "통장이 비명을 질렀다.",
        "현실을 보게됐다.",
        "머리가 띵해졌다.",
      ],
      destroy: [
        "전재산이 날아갔다!!!",
        "눈물이 앞을 가린다...",
        "한강뷰를 검색한다.",
        "은행 대출부터 찾는다.",
        "잠시 말을 잃었다.",
      ],
      max: [
        "인생 탈출!",
      ],
    },
  },
};
