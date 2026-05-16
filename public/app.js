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

function render() {
  const loggedIn = Boolean(state.session && state.profile);
  $("authView").classList.toggle("hidden", loggedIn);
  $("gameView").classList.toggle("hidden", !loggedIn);

  if (!loggedIn) return;

  $("meName").textContent = state.profile.nickname;
  $("meHp").textContent = state.profile.hp ?? 100;
  $("meStatus").textContent = state.profile.status || "정상";
  $("aiBadge").textContent = "GPT GM";

  $("eventTitle").textContent = state.event?.title || "아직 사건 없음";
  $("eventScene").textContent = state.event?.scene || "새 이벤트를 시작하면 장면이 표시됩니다.";
  $("eventStakes").textContent = state.event?.stakes ? `목표/위험: ${state.event.stakes}` : "";

  const settings = state.room?.settings || {};
  $("autoEvents").checked = Boolean(settings.auto_events);
  $("intervalMinutes").value = settings.event_interval_minutes || 60;
  if (settings.event_prompt) $("eventPrompt").value = settings.event_prompt;

  $("players").innerHTML = "";
  state.profiles.forEach((profile) => {
    const chip = document.createElement("span");
    chip.className = "player-chip";
    chip.textContent = `${profile.nickname} · HP ${profile.hp ?? 100}`;
    $("players").appendChild(chip);
  });

  const box = $("messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = "";
  state.messages.forEach((message) => box.appendChild(messageNode(message)));
  if (nearBottom) box.scrollTop = box.scrollHeight;
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
  render();

  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (session) await loadGame();
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
  await Promise.all([loadProfile(), loadProfiles(), loadEvent(), loadMessages()]);
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

async function loadProfiles() {
  const { data, error } = await state.supabase
    .from("profiles")
    .select("id,nickname,hp,status,updated_at")
    .order("updated_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  state.profiles = data || [];
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
    .limit(80);
  if (error) throw error;
  state.messages = (data || []).reverse();
}

function subscribeRealtime() {
  if (state.channel) state.supabase.removeChannel(state.channel);
  state.channel = state.supabase
    .channel(`room:${state.room.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `room_id=eq.${state.room.id}` },
      loadMessagesAndRender,
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
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadProfilesAndRender)
    .subscribe();
}

async function loadMessagesAndRender() {
  await loadMessages();
  render();
}

async function loadEventAndRender() {
  await loadEvent();
  render();
}

async function loadRoomAndRender() {
  await ensureRoom();
  render();
}

async function loadProfilesAndRender() {
  await Promise.all([loadProfile(), loadProfiles()]);
  render();
}

async function callFunction(name, body) {
  const { data, error } = await state.supabase.functions.invoke(name, { body });
  if (error) throw error;
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
  if (state.channel) await state.supabase.removeChannel(state.channel);
  await state.supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  state.room = null;
  state.event = null;
  state.messages = [];
  state.profiles = [];
  render();
});

$("messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("messageInput");
  const text = input.value.trim();
  if (!text || !state.room || !state.profile) return;
  input.value = "";

  const { error } = await state.supabase.from("messages").insert({
    room_id: state.room.id,
    user_id: state.profile.id,
    nickname: state.profile.nickname,
    kind: "chat",
    text,
  });

  if (error) {
    input.value = text;
    alert(error.message);
    return;
  }

  try {
    await callFunction("judge-action", { room_id: state.room.id, action: text });
  } catch (err) {
    alert(err.message);
  }
});

$("startEventBtn").addEventListener("click", async () => {
  $("startEventBtn").disabled = true;
  try {
    await callFunction("start-event", {
      room_id: state.room.id,
      prompt: $("eventPrompt").value,
    });
  } catch (err) {
    alert(err.message);
  } finally {
    $("startEventBtn").disabled = false;
  }
});

$("saveSettingsBtn").addEventListener("click", async () => {
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

init();
