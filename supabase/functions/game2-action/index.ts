import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const enhanceSaveKey = "enhanceWorkshop";

type Game2Action = "get" | "join" | "pass" | "reset" | "start" | "end" | "remove_participant";

type Participant = {
  id: string;
  nickname: string;
  joinedAt: string;
};

type LogEntry = {
  at: string;
  text: string;
};

type Game2State = {
  dateKey: string;
  participants: Participant[];
  turnBase: number | null;
  holderId: string | null;
  currentTurn: number | null;
  idleTurns: number;
  lastActionTurn: number | null;
  pendingTransferTargetId: string | null;
  pendingTransferTurn: number | null;
  forcedStatus: "active" | "ended" | null;
  finalHolderId: string | null;
  finalHolderName: string | null;
  resultRecorded: boolean;
  log: LogEntry[];
  detailLog: LogEntry[];
};

type SupabaseClient = ReturnType<typeof createClient>;

const config = {
  testMode: true,
  turnMinutes: 1,
  joinOpen: true,
  startHour: 9,
  endHour: 21,
  maxCarryTurns: 1,
  logLimit: 40,
  timezone: "Asia/Seoul",
};

const rewardTable = [
  { chance: 25, group: "nonWinners", amount: 10, label: "우승자 제외 참여자 +10" },
  { chance: 15, group: "nonWinners", amount: 20, label: "우승자 제외 참여자 +20" },
  { chance: 5, group: "nonWinners", amount: 30, label: "우승자 제외 참여자 +30" },
  { chance: 30, group: "winner", amount: 30, label: "우승자 +30" },
  { chance: 20, group: "winner", amount: 50, label: "우승자 +50" },
  { chance: 5, group: "winner", amount: 100, label: "우승자 +100" },
];

function defaultEnhanceGame() {
  return {
    level: 0,
    attempts: 10,
    bestLevel: 0,
    destroyed: false,
    history: [],
    nextAttemptAt: null,
    cooldownSeconds: 360,
    version: 1,
  };
}

function pickBonusReward() {
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const reward of rewardTable) {
    cursor += reward.chance;
    if (roll < cursor) return reward;
  }
  return rewardTable[rewardTable.length - 1];
}

async function addEnhanceAttempts(supabase: SupabaseClient, userIds: string[], amount: number) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0 || amount <= 0) return;

  const { data: profiles, error: fetchError } = await supabase
    .from("profiles")
    .select("id,inventory")
    .in("id", uniqueIds);
  if (fetchError) throw fetchError;

  for (const profile of profiles || []) {
    const inventory = profile.inventory && !Array.isArray(profile.inventory) ? profile.inventory : {};
    const savedGame = inventory[enhanceSaveKey] && typeof inventory[enhanceSaveKey] === "object"
      ? inventory[enhanceSaveKey]
      : defaultEnhanceGame();
    const attempts = Number.isFinite(savedGame.attempts) ? Number(savedGame.attempts) : 0;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        inventory: {
          ...inventory,
          [enhanceSaveKey]: {
            ...defaultEnhanceGame(),
            ...savedGame,
            attempts: attempts + amount,
          },
        },
      })
      .eq("id", profile.id);
    if (updateError) throw updateError;
  }
}

function kstParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    totalMinutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function defaultState(dateKey: string): Game2State {
  return {
    dateKey,
    participants: [],
    turnBase: null,
    holderId: null,
    currentTurn: null,
    idleTurns: 0,
    lastActionTurn: null,
    pendingTransferTargetId: null,
    pendingTransferTurn: null,
    forcedStatus: null,
    finalHolderId: null,
    finalHolderName: null,
    resultRecorded: false,
    log: [],
    detailLog: [],
  };
}

function phaseFor(hour: number, totalMinutes: number) {
  if (config.testMode) {
    return {
      status: "active",
      targetTurn: Math.floor(totalMinutes / config.turnMinutes),
      joinOpen: config.joinOpen,
    };
  }

  if (hour < config.startHour) return { status: "registration", targetTurn: null, joinOpen: true };
  if (hour >= config.endHour) {
    return { status: "ended", targetTurn: config.endHour - config.startHour, joinOpen: false };
  }
  return { status: "active", targetTurn: hour - config.startHour, joinOpen: false };
}

function turnLabel(turn: number | null) {
  if (turn === null) return "-";
  if (config.testMode) {
    const startMinute = turn * config.turnMinutes;
    const endMinute = startMinute + config.turnMinutes;
    const startHour = Math.floor(startMinute / 60) % 24;
    const endHour = Math.floor(endMinute / 60) % 24;
    return `${String(startHour).padStart(2, "0")}:${String(startMinute % 60).padStart(2, "0")} - ${String(endHour).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
  }

  const start = config.startHour + turn;
  const end = Math.min(start + 1, config.endHour);
  return `${String(start).padStart(2, "0")}:00 - ${String(end).padStart(2, "0")}:00`;
}

function addLog(state: Game2State, text: string) {
  state.log = [{ at: new Date().toISOString(), text }, ...(state.log || [])].slice(0, config.logLimit);
}

function addDetailLog(state: Game2State, text: string) {
  state.detailLog = [...(state.detailLog || []), { at: new Date().toISOString(), text }].slice(-config.logLimit);
}

function turnName(turn: number) {
  return `${turn + 1}턴`;
}

function turnStartName(turn: number) {
  return `${turn + 1}턴 시작`;
}

function randomParticipant(participants: Participant[], excludeId?: string | null) {
  const candidates = participants.filter((participant) => participant.id !== excludeId);
  const pool = candidates.length > 0 ? candidates : participants;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function participantName(state: Game2State, userId: string | null) {
  return state.participants.find((participant) => participant.id === userId)?.nickname || "알 수 없음";
}

function captureFinalHolder(state: Game2State) {
  state.finalHolderId = state.holderId;
  state.finalHolderName = state.holderId ? participantName(state, state.holderId) : null;
}

async function finishGame(state: Game2State, supabase: SupabaseClient) {
  if (state.resultRecorded) return;
  captureFinalHolder(state);
  const winner = state.finalHolderName || "없음";
  const participantNames = state.participants.map((participant) => participant.nickname).join(", ") || "없음";
  const participantIds = state.participants.map((participant) => participant.id);
  const winnerIds = state.finalHolderId ? [state.finalHolderId] : [];
  const nonWinnerIds = participantIds.filter((id) => id !== state.finalHolderId);
  const bonus = pickBonusReward();
  const bonusTargetIds = bonus.group === "winner" ? winnerIds : nonWinnerIds;

  await addEnhanceAttempts(supabase, participantIds, 10);
  await addEnhanceAttempts(supabase, bonusTargetIds, bonus.amount);

  addLog(state, `참여자: ${participantNames}`);
  addLog(state, `결과 발표: 우승자 ${winner}`);
  addLog(state, `보상: 참여자 전원 강화 횟수 +10`);
  addLog(state, `추가 보상: ${bonus.label}`);
  addDetailLog(state, `결과 발표: 우승자 ${winner}`);
  addDetailLog(state, `참여자: ${participantNames}`);
  addDetailLog(state, `보상: 참여자 전원 강화 횟수 +10`);
  addDetailLog(state, `추가 보상: ${bonus.label}`);
  state.participants = [];
  state.resultRecorded = true;
}

function normalizeState(raw: unknown, dateKey: string): Game2State {
  const saved = raw && typeof raw === "object" ? raw as Partial<Game2State> : {};
  if (saved.dateKey !== dateKey) return defaultState(dateKey);

  return {
    dateKey,
    participants: Array.isArray(saved.participants) ? saved.participants : [],
    turnBase: Number.isInteger(saved.turnBase) ? saved.turnBase as number : null,
    holderId: saved.holderId || null,
    currentTurn: Number.isInteger(saved.currentTurn) ? saved.currentTurn as number : null,
    idleTurns: Number.isInteger(saved.idleTurns) ? saved.idleTurns as number : 0,
    lastActionTurn: Number.isInteger(saved.lastActionTurn) ? saved.lastActionTurn as number : null,
    pendingTransferTargetId: typeof saved.pendingTransferTargetId === "string" ? saved.pendingTransferTargetId : null,
    pendingTransferTurn: Number.isInteger(saved.pendingTransferTurn) ? saved.pendingTransferTurn as number : null,
    forcedStatus: saved.forcedStatus === "active" || saved.forcedStatus === "ended" ? saved.forcedStatus : null,
    finalHolderId: typeof saved.finalHolderId === "string" ? saved.finalHolderId : null,
    finalHolderName: typeof saved.finalHolderName === "string" ? saved.finalHolderName : null,
    resultRecorded: Boolean(saved.resultRecorded),
    log: Array.isArray(saved.log) ? saved.log.slice(0, config.logLimit) : [],
    detailLog: Array.isArray(saved.detailLog) ? saved.detailLog.slice(-config.logLimit) : [],
  };
}

function effectivePhase(state: Game2State, phase: { status: string; targetTurn: number | null; joinOpen: boolean }) {
  const testTargetTurn = config.testMode && phase.targetTurn !== null
    ? Math.max(0, phase.targetTurn - (state.turnBase ?? phase.targetTurn))
    : phase.targetTurn;

  if (state.forcedStatus === "ended") {
    return { status: "ended", targetTurn: testTargetTurn ?? state.currentTurn, joinOpen: false };
  }

  if (state.forcedStatus === "active") {
    return {
      status: "active",
      targetTurn: testTargetTurn ?? state.currentTurn ?? 0,
      joinOpen: config.testMode ? config.joinOpen : false,
    };
  }

  return { ...phase, targetTurn: testTargetTurn };
}

function applyPendingTransfer(state: Game2State, completedTurn: number) {
  if (!state.pendingTransferTargetId) return false;
  const target = state.participants.find((participant) => participant.id === state.pendingTransferTargetId);
  state.pendingTransferTargetId = null;
  state.pendingTransferTurn = null;
  if (!target) return false;

  state.holderId = target.id;
  addLog(state, "박스가 다른 참여자에게 넘어갔습니다.");
  addDetailLog(state, `${turnStartName(completedTurn + 1)}: 박스가 ${target.nickname}에게 이동`);
  return true;
}

function advanceState(state: Game2State, targetTurn: number | null) {
  if (targetTurn === null || state.participants.length === 0) return;

  if (!state.holderId) {
    const firstHolder = randomParticipant(state.participants);
    state.holderId = firstHolder?.id || null;
    state.idleTurns = 0;
    if (firstHolder) addLog(state, "첫 박스가 배정되었습니다.");
    if (firstHolder) addDetailLog(state, `시작: 첫 박스는 ${firstHolder.nickname}`);
  }

  if (state.currentTurn === null) {
    state.currentTurn = targetTurn;
    return;
  }

  if (targetTurn <= state.currentTurn) return;

  if (config.testMode && targetTurn - state.currentTurn > 3) {
    if (
      state.pendingTransferTurn !== null
      && state.pendingTransferTurn >= state.currentTurn
      && state.pendingTransferTurn < targetTurn
    ) {
      applyPendingTransfer(state, state.pendingTransferTurn);
    }
    state.currentTurn = targetTurn;
    state.idleTurns = 0;
    return;
  }

  for (let turn = state.currentTurn; turn < targetTurn; turn += 1) {
    if (!state.holderId) break;

    if (state.lastActionTurn === turn) {
      if (state.pendingTransferTurn === turn) {
        applyPendingTransfer(state, turn);
      }
      state.idleTurns = 0;
      continue;
    }

    addDetailLog(state, `${turnName(turn)}: ${participantName(state, state.holderId)} 행동 안 함`);
    state.idleTurns += 1;
    if (state.idleTurns > config.maxCarryTurns) {
      const nextHolder = randomParticipant(state.participants, state.holderId);
      state.holderId = nextHolder?.id || state.holderId;
      state.idleTurns = 0;
      if (nextHolder) {
        addLog(state, "박스가 랜덤한 사람한테 재배치 되었습니다.");
        addDetailLog(state, `${turnStartName(turn + 1)}: 2번 미행동으로 랜덤 재배치, 박스가 ${nextHolder.nickname}에게 이동`);
      }
    }
  }

  state.currentTurn = targetTurn;
}

function publicState(
  state: Game2State,
  status: string,
  targetTurn: number | null,
  joinOpen: boolean,
  viewerId: string,
) {
  const currentTurn = status === "active" ? targetTurn : state.currentTurn;
  const viewerHasBox = state.holderId === viewerId;
  const revealHolder = status === "ended" || viewerHasBox;
  const visibleHolderId = status === "ended" ? state.finalHolderId || state.holderId : state.holderId;
  let message = config.testMode
    ? "테스트 모드입니다. 1분마다 새 타임으로 넘어갑니다."
    : "아침 9시 이전에 참여하면 오늘 게임2에 들어갑니다.";
  if (status === "active") {
    message = viewerHasBox
      ? "내가 박스를 갖고 있습니다. 이번 타임에 원하는 참여자에게 넘길 수 있습니다."
      : "참여자가 있으면 박스가 자동으로 배정됩니다.";
  }
  if (status === "ended") message = "저녁 9시가 지나 오늘 게임2 결과가 정리되었습니다.";

  return {
    ...state,
    holderId: revealHolder ? visibleHolderId : null,
    realHolderId: undefined,
    lastActionTurn: viewerHasBox ? state.lastActionTurn : null,
    pendingTransferTargetId: undefined,
    pendingTransferTurn: undefined,
    status,
    currentTurn,
    currentTurnLabel: turnLabel(currentTurn),
    joinOpen,
    viewerHasBox,
    holderHidden: Boolean(state.holderId && !revealHolder),
    log: status === "ended" ? state.detailLog : state.log,
    detailLog: undefined,
    message,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("로그인이 필요합니다.");

    const body = await req.json().catch(() => ({}));
    const action = (body.action || "get") as Game2Action;
    if (!["get", "join", "pass", "reset", "start", "end", "remove_participant"].includes(action)) {
      throw new Error("지원하지 않는 게임2 작업입니다.");
    }

    const supabase = createClient(url, serviceKey);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,nickname,is_admin")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !profile) throw new Error("프로필을 찾을 수 없습니다.");

    const { dateKey, hour, totalMinutes } = kstParts();
    const phase = phaseFor(hour, totalMinutes);
    const { data: row, error: stateError } = await supabase
      .from("game2_state")
      .select("data")
      .eq("id", "main")
      .maybeSingle();
    if (stateError) throw stateError;

    let state = normalizeState(row?.data, dateKey);
    const beforeState = JSON.stringify(state);

    if (action === "start") {
      if (!profile.is_admin) throw new Error("관리자만 게임을 진행할 수 있습니다.");
      state.forcedStatus = "active";
      state.turnBase = phase.targetTurn;
      state.holderId = null;
      state.currentTurn = null;
      state.idleTurns = 0;
      state.lastActionTurn = null;
      state.pendingTransferTargetId = null;
      state.pendingTransferTurn = null;
      state.finalHolderId = null;
      state.finalHolderName = null;
      state.resultRecorded = false;
      state.log = [];
      state.detailLog = [];
      addLog(state, "관리자가 게임을 진행 상태로 변경했습니다.");
    }

    if (config.testMode && state.turnBase === null && phase.targetTurn !== null) {
      state.turnBase = phase.targetTurn;
    }

    if (action === "end") {
      if (!profile.is_admin) throw new Error("관리자만 게임을 종료할 수 있습니다.");
      state.forcedStatus = "ended";
    }

    const activePhase = effectivePhase(state, phase);
    advanceState(state, activePhase.targetTurn);

    if (activePhase.status === "ended" && !state.finalHolderId && state.holderId) {
      captureFinalHolder(state);
    }

    if (activePhase.status === "ended") {
      await finishGame(state, supabase);
    }

    if (action === "join") {
      if (!activePhase.joinOpen) throw new Error("지금은 게임2 참여가 닫혀 있습니다.");
      const exists = state.participants.some((participant) => participant.id === profile.id);
      if (!exists) {
        state.participants.push({
          id: profile.id,
          nickname: profile.nickname,
          joinedAt: new Date().toISOString(),
        });
        addLog(state, `${profile.nickname}님이 참여했습니다.`);
      }
    }

    if (action === "pass") {
      if (activePhase.status !== "active") throw new Error("진행 중인 타임에만 박스를 넘길 수 있습니다.");
      const actionTurn = activePhase.targetTurn;
      if (actionTurn === null) throw new Error("현재 타임을 확인할 수 없습니다.");
      if (state.holderId !== profile.id) throw new Error("박스를 가진 사람만 행동할 수 있습니다.");
      if (state.lastActionTurn === actionTurn) throw new Error("이번 타임의 행동은 이미 끝났습니다.");
      const target = state.participants.find((participant) => participant.id === body.target_user_id);
      if (!target) throw new Error("넘길 대상을 찾을 수 없습니다.");
      if (target.id === profile.id) throw new Error("자기 자신에게는 넘길 수 없습니다.");

      state.pendingTransferTargetId = target.id;
      state.pendingTransferTurn = actionTurn;
      state.idleTurns = 0;
      state.lastActionTurn = actionTurn;
      addDetailLog(state, `${turnName(actionTurn)}: ${profile.nickname}가 ${target.nickname}에게 넘기기 예약`);
    }

    if (action === "remove_participant") {
      if (!profile.is_admin) throw new Error("관리자만 참여자를 제거할 수 있습니다.");
      const targetUserId = String(body.target_user_id || "");
      const target = state.participants.find((participant) => participant.id === targetUserId);
      if (!target) throw new Error("제거할 참여자를 찾을 수 없습니다.");
      state.participants = state.participants.filter((participant) => participant.id !== targetUserId);
      if (state.pendingTransferTargetId === targetUserId) {
        state.pendingTransferTargetId = null;
        state.pendingTransferTurn = null;
        if (state.lastActionTurn === activePhase.targetTurn) state.lastActionTurn = null;
      }
      if (state.holderId === targetUserId) {
        const nextHolder = randomParticipant(state.participants);
        state.holderId = nextHolder?.id || null;
        state.idleTurns = 0;
        state.pendingTransferTargetId = null;
        state.pendingTransferTurn = null;
      }
      addLog(state, `${target.nickname}님이 참여자 목록에서 제거되었습니다.`);
      addDetailLog(state, `${target.nickname}님이 참여자 목록에서 제거되었습니다.`);
    }

    if (action === "reset") {
      if (!profile.is_admin) throw new Error("관리자만 초기화할 수 있습니다.");
      state = defaultState(dateKey);
      addLog(state, "관리자가 오늘 게임2를 초기화했습니다.");
    }

    const shouldSave = !row || action !== "get" || JSON.stringify(state) !== beforeState;
    if (shouldSave) {
      const { error: upsertError } = await supabase
        .from("game2_state")
        .upsert({ id: "main", data: state }, { onConflict: "id" });
      if (upsertError) throw upsertError;
    }

    return Response.json(
      { ok: true, state: publicState(state, activePhase.status, activePhase.targetTurn, activePhase.joinOpen, profile.id) },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: String(error.message || error) },
      { status: 400, headers: corsHeaders },
    );
  }
});
