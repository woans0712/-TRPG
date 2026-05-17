window.ENHANCE_BACKEND_DATA = {
  version: 1,

  storage: {
    saveKey: "enhanceWorkshop",
    localPrefix: "enhanceWorkshop:",
    syncDebounceMs: 350,
  },

  auth: {
    primaryPrefix: "trpg",
    primaryDomain: "trpgsim.app",
    fallbackPrefix: "enhance",
    fallbackDomain: "ddubbi-sim.app",
  },

  game: {
    item: {
      name: "낡은 심심검",
      type: "수상한 한손검",
      flavor: "강화할수록 묘하게 눈치가 보이는 검.",
      maxLevel: 15,
    },

    startingState: {
      level: 0,
      coins: 12000,
      shards: 20,
      attempts: 10,
      bestLevel: 0,
      pity: 0,
    },

    attempt: {
      max: 10,
      cooldownSeconds: 45,
    },

    pity: {
      bonusPerStack: 1.5,
      maxBonus: 12,
      resetOnSuccess: true,
    },

    gradeLabels: [
      { minLevel: 12, text: "붕괴권", grade: "legend" },
      { minLevel: 10, text: "위험", grade: "rare" },
      { minLevel: 5, text: "불안정", grade: "fine" },
      { minLevel: 0, text: "안정", grade: "plain" },
    ],

    levels: [
      { level: 0, success: 95, cost: 200, shards: 0, fail: "keep", destroyChance: 0 },
      { level: 1, success: 90, cost: 350, shards: 0, fail: "keep", destroyChance: 0 },
      { level: 2, success: 84, cost: 500, shards: 1, fail: "keep", destroyChance: 0 },
      { level: 3, success: 76, cost: 750, shards: 1, fail: "keep", destroyChance: 0 },
      { level: 4, success: 68, cost: 1000, shards: 2, fail: "keep", destroyChance: 0 },
      { level: 5, success: 58, cost: 1400, shards: 2, fail: "downgrade", destroyChance: 0 },
      { level: 6, success: 49, cost: 1800, shards: 3, fail: "downgrade", destroyChance: 0 },
      { level: 7, success: 40, cost: 2300, shards: 3, fail: "downgrade", destroyChance: 0 },
      { level: 8, success: 32, cost: 2900, shards: 4, fail: "downgrade", destroyChance: 0 },
      { level: 9, success: 25, cost: 3600, shards: 5, fail: "downgrade", destroyChance: 0 },
      { level: 10, success: 18, cost: 4600, shards: 6, fail: "crack", destroyChance: 6 },
      { level: 11, success: 13, cost: 5800, shards: 8, fail: "crack", destroyChance: 10 },
      { level: 12, success: 9, cost: 7200, shards: 10, fail: "crack", destroyChance: 18 },
      { level: 13, success: 6, cost: 9000, shards: 12, fail: "crack", destroyChance: 28 },
      { level: 14, success: 3, cost: 12000, shards: 15, fail: "crack", destroyChance: 40 },
    ],

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
