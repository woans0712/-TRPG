const ROOM_SLUG = "main";

const $ = (id) => document.getElementById(id);

const state = {
  supabase: null,
  session: null,
  profile: null,
  room: null,
  event: null,
  messages: [],
  profiles: [],
  channel: null,
  busy: false,
  authReady: false,
  pendingJudgments: 0,
};

function requireConfig() {
  const url = window.TRPG_SUPABASE_URL;
  const key = window.TRPG_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR_") || key.includes("YOUR_")) {
    throw new Error("public/supabase-config.js에 Supabase URL과 anon key를 입력하세요.");
  }
  return { url, key };
}

function nicknameEmail(nickname) {
  const encoded = Array.from(nickname.trim().toLowerCase())
    .map((ch) => ch.codePointAt(0).toString(16))
    .join("");
  return `trpg${encoded}@trpgsim.app`;
}

function timeLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function setAuthError(message) {
  $("authError").textContent = message || "";
}

function setBusy(isBusy, message = "") {
  state.busy = isBusy;
  $("statusLine").textContent = message;
  $("sendMessageBtn").disabled = isBusy;
  $("messageInput").disabled = isBusy;
  $("startEventBtn").disabled = isBusy;
}

function setJudgmentPending(delta) {
  state.pendingJudgments = Math.max(0, state.pendingJudgments + delta);
  if (state.pendingJudgments > 0) {
    $("statusLine").textContent =
      state.pendingJudgments === 1
        ? "GM이 판정 중... 계속 입력할 수 있습니다."
        : `GM이 ${state.pendingJudgments}개 행동을 판정 중...`;
  } else if (!state.busy) {
    $("statusLine").textContent = "";
  }
}

function isAdminProfile(profile = state.profile) {
  return Boolean(profile?.is_admin);
}

function render() {
  $("loadingView").classList.toggle("hidden", state.authReady);
  if (!state.authReady) {
    $("authView").classList.add("hidden");
    $("gameView").classList.add("hidden");
    return;
  }

  const loggedIn = Boolean(state.session && state.profile);
  $("authView").classList.toggle("hidden", loggedIn);
  $("gameView").classList.toggle("hidden", !loggedIn);

  if (!loggedIn) return;

  $("meName").textContent = state.profile.nickname;
  $("meHp").textContent = state.profile.hp ?? 100;
  $("meStatus").textContent = state.profile.status || "정상";
  $("aiBadge").textContent = "GPT GM";
  $("clearMessagesBtn").classList.toggle("hidden", !isAdminProfile());
  $("eventAdminPanel").classList.toggle("hidden", !isAdminProfile());
  $("settingsAdminPanel").classList.toggle("hidden", !isAdminProfile());

  $("eventTitle").textContent = state.event?.title || "아직 사건 없음";
  $("eventScene").textContent = state.event?.scene || "새 이벤트를 시작하면 장면이 표시됩니다.";
  $("eventStakes").textContent = "";

  const settings = state.room?.settings || {};
  $("autoEvents").checked = Boolean(settings.auto_events);
  $("intervalMinutes").value = settings.event_interval_minutes || 60;
  if (settings.event_prompt) $("eventPrompt").value = settings.event_prompt;

  $("players").innerHTML = "";
  state.profiles.forEach((profile) => {
    const chip = document.createElement("span");
    chip.className = "player-chip";
    chip.textContent = `${profile.nickname} · 접속중`;
    $("players").appendChild(chip);
  });

  const box = $("messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = "";
  state.messages.forEach((message) => box.appendChild(messageNode(message)));
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

function appendMessage(message) {
  if (!message?.id) return;
  if (state.messages.some((item) => item.id === message.id)) return;
  state.messages = [...state.messages, message].slice(-30);
  render();
}

function messageNode(message) {
  const el = document.createElement("article");
  el.className = `message ${message.kind}`;

  const head = document.createElement("div");
  head.className = "message-head";

  const name = document.createElement("strong");
  name.textContent = message.nickname || "GM";
  const time = document.createElement("time");
  time.textContent = timeLabel(message.created_at);
  head.append(name, time);

  const text = document.createElement("div");
  text.textContent = message.text;

  el.append(head, text);
  return el;
}

async function init() {
  try {
    const config = requireConfig();
    state.supabase = window.supabase.createClient(config.url, config.key);
  } catch (err) {
    setAuthError(err.message);
    return;
  }

  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  if (state.session) await loadGame();
  state.authReady = true;
  render();

  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (session) {
      await loadGame();
    } else {
      resetGameState();
    }
    state.authReady = true;
    render();
  });
}

async function auth(mode) {
  setAuthError("");
  const nickname = $("nickname").value.trim();
  const password = $("password").value;

  if (nickname.length < 2) {
    setAuthError("닉네임은 2자 이상이어야 합니다.");
    return;
  }
  if (password.length < 6) {
    setAuthError("비밀번호는 6자 이상이어야 합니다.");
    return;
  }

  const email = nicknameEmail(nickname);
  const options = mode === "register" ? { data: { nickname } } : undefined;
  const result =
    mode === "register"
      ? await state.supabase.auth.signUp({ email, password, options })
      : await state.supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    setAuthError(result.error.message);
    return;
  }

  state.session = result.data.session;
  if (!state.session) {
    setAuthError("가입 확인 메일 설정이 켜져 있으면 바로 로그인되지 않습니다. Supabase Auth에서 Confirm email을 꺼주세요.");
    return;
  }

  await ensureProfile(nickname);
  await loadGame();
  render();
}

async function ensureProfile(nickname) {
  const user = state.session.user;
  const { error } = await state.supabase.from("profiles").upsert(
    {
      id: user.id,
      nickname,
      hp: 100,
      status: "정상",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

async function loadGame() {
  await ensureRoom();
  await Promise.all([loadProfile(), loadEvent(), loadMessages()]);
  state.profiles = [state.profile];
  subscribeRealtime();
}

async function ensureRoom() {
  const { data, error } = await state.supabase
    .from("rooms")
    .select("*")
    .eq("slug", ROOM_SLUG)
    .maybeSingle();
  if (error) throw error;
  state.room = data;
  if (!state.room) throw new Error("기본 방이 없습니다. supabase/schema.sql을 먼저 실행하세요.");
}

async function loadProfile() {
  const { data, error } = await state.supabase
    .from("profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .single();
  if (error) throw error;
  state.profile = data;
}

async function loadEvent() {
  const { data, error } = await state.supabase
    .from("events")
    .select("*")
    .eq("room_id", state.room.id)
    .eq("active", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  state.event = data;
}

async function loadMessages() {
  const { data, error } = await state.supabase
    .from("messages")
    .select("*")
    .eq("room_id", state.room.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  state.messages = (data || []).reverse();
}

function subscribeRealtime() {
  if (state.channel) state.supabase.removeChannel(state.channel);
  state.channel = state.supabase
    .channel(`room:${state.room.id}`)
    .on("presence", { event: "sync" }, () => {
      const presenceState = state.channel.presenceState();
      state.profiles = Object.values(presenceState)
        .flat()
        .map((presence) => ({
          id: presence.user_id,
          nickname: presence.nickname,
        }))
        .filter((profile, index, list) => profile.nickname && list.findIndex((item) => item.id === profile.id) === index)
        .sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
      render();
    })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${state.room.id}` },
      (payload) => appendMessage(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events", filter: `room_id=eq.${state.room.id}` },
      loadEventAndRender,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${state.room.id}` },
      loadRoomAndRender,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadProfileAndRender)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await state.channel.track({
          user_id: state.profile.id,
          nickname: state.profile.nickname,
        });
      }
    });
}

async function loadEventAndRender() {
  await loadEvent();
  render();
}

async function loadRoomAndRender() {
  await ensureRoom();
  render();
}

async function loadProfileAndRender() {
  await loadProfile();
  if (state.channel) {
    await state.channel.track({
      user_id: state.profile.id,
      nickname: state.profile.nickname,
    });
  }
  render();
}

async function callFunction(name, body) {
  const timeout = new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error("GM 응답이 너무 오래 걸립니다. 잠시 후 다시 시도해주세요.")), 45000);
  });
  const { data, error } = await Promise.race([state.supabase.functions.invoke(name, { body }), timeout]);
  if (error) {
    let message = error.message || "Edge Function 호출에 실패했습니다.";
    const response = error.context;
    if (response) {
      try {
        const payload = await response.clone().json();
        message = payload.error || payload.message || message;
      } catch {
        try {
          const text = await response.clone().text();
          if (text) message = text;
        } catch {
          // Keep the original error message.
        }
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

$("loginBtn").addEventListener("click", () => auth("login"));
$("registerBtn").addEventListener("click", () => auth("register"));
$("authForm").addEventListener("submit", (event) => {
  event.preventDefault();
  auth("login");
});

$("logoutBtn").addEventListener("click", async () => {
  state.authReady = false;
  render();
  if (state.channel) await state.supabase.removeChannel(state.channel);
  await state.supabase.auth.signOut();
  resetGameState();
  state.authReady = true;
  render();
});

function resetGameState() {
  state.session = null;
  state.profile = null;
  state.room = null;
  state.event = null;
  state.messages = [];
  state.profiles = [];
  state.channel = null;
}

$("messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("messageInput");
  const text = input.value.trim();
  if (!text || !state.room || !state.profile) return;
  input.value = "";
  input.focus();

  const { data: insertedMessage, error } = await state.supabase
    .from("messages")
    .insert({
      room_id: state.room.id,
      user_id: state.profile.id,
      nickname: state.profile.nickname,
      kind: "chat",
      text,
    })
    .select()
    .single();

  if (error) {
    input.value = text;
    alert(error.message);
    return;
  }

  appendMessage(insertedMessage);
  setJudgmentPending(1);
  callFunction("judge-action", { room_id: state.room.id, action: text })
    .catch((err) => {
      alert(err.message);
    })
    .finally(() => {
      setJudgmentPending(-1);
    });
});

$("startEventBtn").addEventListener("click", async () => {
  if (!isAdminProfile()) return;
  if (state.busy) return;
  setBusy(true, "GM이 새 이벤트를 준비하는 중...");
  try {
    await callFunction("start-event", {
      room_id: state.room.id,
      prompt: $("eventPrompt").value,
    });
  } catch (err) {
    alert(err.message);
  } finally {
    setBusy(false);
  }
});

$("saveSettingsBtn").addEventListener("click", async () => {
  if (!isAdminProfile()) return;
  const settings = {
    ...(state.room?.settings || {}),
    auto_events: $("autoEvents").checked,
    event_interval_minutes: Number($("intervalMinutes").value || 60),
    event_prompt: $("eventPrompt").value,
  };
  const { error } = await state.supabase.from("rooms").update({ settings }).eq("id", state.room.id);
  if (error) alert(error.message);
  await ensureRoom();
  render();
});

$("clearMessagesBtn").addEventListener("click", async () => {
  if (!isAdminProfile()) return;
  const ok = confirm("채팅 기록을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.");
  if (!ok) return;

  $("clearMessagesBtn").disabled = true;
  try {
    await callFunction("clear-messages", { room_id: state.room.id });
    await loadMessages();
    render();
  } catch (err) {
    alert(err.message);
  } finally {
    $("clearMessagesBtn").disabled = false;
  }
});

init();
