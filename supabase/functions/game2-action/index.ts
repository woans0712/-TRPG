import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type Game2Action = "get" | "join" | "pass" | "reset";

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
  holderId: string | null;
  currentTurn: number | null;
  idleTurns: number;
  lastActionTurn: number | null;
  log: LogEntry[];
};

const config = {
  startHour: 9,
  endHour: 21,
  maxCarryTurns: 1,
  logLimit: 40,
  timezone: "Asia/Seoul",
};

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
  };
}

function defaultState(dateKey: string): Game2State {
  return {
    dateKey,
    participants: [],
    holderId: null,
    currentTurn: null,
    idleTurns: 0,
    lastActionTurn: null,
    log: [],
  };
}

function phaseFor(hour: number) {
  if (hour < config.startHour) return { status: "registration", targetTurn: null };
  if (hour >= config.endHour) return { status: "ended", targetTurn: config.endHour - config.startHour };
  return { status: "active", targetTurn: hour - config.startHour };
}

function turnLabel(turn: number | null) {
  if (turn === null) return "-";
  const start = config.startHour + turn;
  const end = Math.min(start + 1, config.endHour);
  return `${String(start).padStart(2, "0")}:00 - ${String(end).padStart(2, "0")}:00`;
}

function addLog(state: Game2State, text: string) {
  state.log = [{ at: new Date().toISOString(), text }, ...(state.log || [])].slice(0, config.logLimit);
}

function randomParticipant(participants: Participant[], excludeId?: string | null) {
  const candidates = participants.filter((participant) => participant.id !== excludeId);
  const pool = candidates.length > 0 ? candidates : participants;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function participantName(state: Game2State, userId: string | null) {
  return state.participants.find((participant) => participant.id === userId)?.nickname || "알 수 없음";
}

function normalizeState(raw: unknown, dateKey: string): Game2State {
  const saved = raw && typeof raw === "object" ? raw as Partial<Game2State> : {};
  if (saved.dateKey !== dateKey) return defaultState(dateKey);

  return {
    dateKey,
    participants: Array.isArray(saved.participants) ? saved.participants : [],
    holderId: saved.holderId || null,
    currentTurn: Number.isInteger(saved.currentTurn) ? saved.currentTurn as number : null,
    idleTurns: Number.isInteger(saved.idleTurns) ? saved.idleTurns as number : 0,
    lastActionTurn: Number.isInteger(saved.lastActionTurn) ? saved.lastActionTurn as number : null,
    log: Array.isArray(saved.log) ? saved.log.slice(0, config.logLimit) : [],
  };
}

function advanceState(state: Game2State, targetTurn: number | null) {
  if (targetTurn === null || state.participants.length === 0) return;

  if (!state.holderId) {
    const firstHolder = randomParticipant(state.participants);
    state.holderId = firstHolder?.id || null;
    state.idleTurns = 0;
    if (firstHolder) addLog(state, `${firstHolder.nickname}님이 첫 ${config.startHour}시 박스를 받았습니다.`);
  }

  if (state.currentTurn === null) {
    state.currentTurn = targetTurn;
    return;
  }

  if (targetTurn <= state.currentTurn) return;

  for (let turn = state.currentTurn; turn < targetTurn; turn += 1) {
    if (!state.holderId) break;

    if (state.lastActionTurn === turn) {
      state.idleTurns = 0;
      continue;
    }

    state.idleTurns += 1;
    if (state.idleTurns > config.maxCarryTurns) {
      const beforeName = participantName(state, state.holderId);
      const nextHolder = randomParticipant(state.participants, state.holderId);
      state.holderId = nextHolder?.id || state.holderId;
      state.idleTurns = 0;
      if (nextHolder) addLog(state, `${beforeName}님이 행동하지 않아 ${nextHolder.nickname}님에게 박스가 자동으로 넘어갔습니다.`);
    }
  }

  state.currentTurn = targetTurn;
}

function publicState(state: Game2State, status: string, targetTurn: number | null) {
  const currentTurn = status === "active" ? targetTurn : state.currentTurn;
  let message = "아침 9시 이전에 참여하면 오늘 게임2에 들어갑니다.";
  if (status === "active") {
    message = state.holderId
      ? "박스를 가진 사람만 이번 타임에 원하는 참여자에게 넘길 수 있습니다."
      : "참여자가 있으면 박스가 자동으로 배정됩니다.";
  }
  if (status === "ended") message = "저녁 9시가 지나 오늘 게임2 결과가 정리되었습니다.";

  return {
    ...state,
    status,
    currentTurn,
    currentTurnLabel: turnLabel(currentTurn),
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
    if (!["get", "join", "pass", "reset"].includes(action)) throw new Error("지원하지 않는 게임2 작업입니다.");

    const supabase = createClient(url, serviceKey);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,nickname,is_admin")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !profile) throw new Error("프로필을 찾을 수 없습니다.");

    const { dateKey, hour } = kstParts();
    const phase = phaseFor(hour);
    const { data: row, error: stateError } = await supabase
      .from("game2_state")
      .select("data")
      .eq("id", "main")
      .maybeSingle();
    if (stateError) throw stateError;

    let state = normalizeState(row?.data, dateKey);
    const beforeState = JSON.stringify(state);
    advanceState(state, phase.targetTurn);

    if (action === "join") {
      if (phase.status !== "registration") throw new Error("게임2 참여는 아침 9시 이전에만 가능합니다.");
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
      if (phase.status !== "active") throw new Error("진행 중인 타임에만 박스를 넘길 수 있습니다.");
      if (state.holderId !== profile.id) throw new Error("박스를 가진 사람만 행동할 수 있습니다.");
      if (state.lastActionTurn === phase.targetTurn) throw new Error("이번 타임의 행동은 이미 끝났습니다.");
      const target = state.participants.find((participant) => participant.id === body.target_user_id);
      if (!target) throw new Error("넘길 대상을 찾을 수 없습니다.");
      if (target.id === profile.id) throw new Error("자기 자신에게는 넘길 수 없습니다.");

      const beforeName = participantName(state, state.holderId);
      state.holderId = target.id;
      state.idleTurns = 0;
      state.lastActionTurn = phase.targetTurn;
      addLog(state, `${beforeName}님이 ${target.nickname}님에게 박스를 넘겼습니다.`);
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
      { ok: true, state: publicState(state, phase.status, phase.targetTurn) },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: String(error.message || error) },
      { status: 400, headers: corsHeaders },
    );
  }
});
