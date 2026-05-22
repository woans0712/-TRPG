const BACKEND = window.ENHANCE_BACKEND_DATA;
const CONFIG = BACKEND.game;
const GAME2 = BACKEND.game2;
const SAVE_KEY = BACKEND.storage.saveKey;

const $ = (id) => document.getElementById(id);

const state = {
  supabase: null,
  session: null,
  profile: null,
  profiles: [],
  game: null,
  game2: null,
  game2Channel: null,
  game2LastLoadAt: 0,
  activeGame: "enhance",
  tick: null,
  saveTimer: null,
  saveInFlight: false,
  saveQueued: false,
};

function getSupabaseConfig() {
  const url = window.TRPG_SUPABASE_URL;
  const key = window.TRPG_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR_") || key.includes("YOUR_")) {
    throw new Error("Supabase 연결 정보가 없습니다. public/supabase-config.js를 확인해주세요.");
  }
  return { url, key };
}

function encodedNickname(nickname) {
  const encoded = Array.from(nickname.trim().toLowerCase())
    .map((ch) => ch.codePointAt(0).toString(16))
    .join("");
  return encoded;
}

function nicknameEmail(nickname) {
  return `${BACKEND.auth.primaryPrefix}${encodedNickname(nickname)}@${BACKEND.auth.primaryDomain}`;
}

function enhanceNicknameEmail(nickname) {
  return `${BACKEND.auth.fallbackPrefix}${encodedNickname(nickname)}@${BACKEND.auth.fallbackDomain}`;
}

function defaultGame() {
  return {
    ...CONFIG.startingState,
    history: [],
    nextAttemptAt: null,
    cooldownSeconds: CONFIG.attempt.cooldownSeconds,
    version: BACKEND.version,
  };
}

function normalizeGame(saved) {
  const base = defaultGame();
  const game = {
    ...base,
    ...(saved || {}),
    attempts: Math.min(saved?.attempts ?? base.attempts, CONFIG.attempt.max),
    destroyed: Boolean(saved?.destroyed ?? base.destroyed),
    history: pruneHistory(Array.isArray(saved?.history) ? saved.history : []),
  };
  syncCooldownRule(game);
  return game;
}

function syncCooldownRule(game) {
  if (game.cooldownSeconds === CONFIG.attempt.cooldownSeconds) return;
  game.cooldownSeconds = CONFIG.attempt.cooldownSeconds;
  if (game.attempts < CONFIG.attempt.max) {
    game.nextAttemptAt = new Date(Date.now() + CONFIG.attempt.cooldownSeconds * 1000).toISOString();
  }
}

function pruneHistory(history) {
  const now = Date.now();
  const maxAge = CONFIG.history.retentionDays * 24 * 60 * 60 * 1000;
  const normalized = history
    .map((entry) => ({
      ...entry,
      createdAt: entry.createdAt || new Date(now).toISOString(),
    }))
    .filter((entry) => now - new Date(entry.createdAt).getTime() <= maxAge);

  return normalized.slice(0, CONFIG.history.maxStored);
}

function readSavedGame(profile) {
  const local = readLocalGame(profile?.id, profile?.updated_at);
  if (local) return local;

  const inventory = profile?.inventory;
  if (inventory && !Array.isArray(inventory) && inventory[SAVE_KEY]) {
    return normalizeGame(inventory[SAVE_KEY]);
  }
  return defaultGame();
}

function localCacheKey(userId = state.profile?.id) {
  return userId ? `${BACKEND.storage.localPrefix}${userId}` : "";
}

function readLocalGame(userId, serverUpdatedAt) {
  const key = localCacheKey(userId);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const local = JSON.parse(raw);
    if (serverUpdatedAt && local.localSavedAt) {
      const serverTime = new Date(serverUpdatedAt).getTime();
      const localTime = new Date(local.localSavedAt).getTime();
      if (serverTime > localTime) return null;
    }
    return normalizeGame(local);
  } catch {
    return null;
  }
}

function saveLocalGame() {
  const key = localCacheKey();
  if (!key || !state.game) return;

  try {
    window.localStorage.setItem(key, JSON.stringify({ ...state.game, localSavedAt: new Date().toISOString() }));
  } catch {
    // Local cache is only a speed boost. Supabase remains the source of truth.
  }
}

function packedInventory(game) {
  const inventory = state.profile?.inventory;
  const current = inventory && !Array.isArray(inventory) ? inventory : {};
  return {
    ...current,
    [SAVE_KEY]: game,
  };
}

function currentRule(level = state.game.level) {
  return CONFIG.levels.find((rule) => rule.level === level) || CONFIG.levels.at(-1);
}

function successChance() {
  if (state.game.destroyed || state.game.level >= CONFIG.item.maxLevel) return 0;
  const rule = currentRule();
  return Math.min(100, rule.success);
}

function canEnhance() {
  if (!state.game) return false;
  if (state.game.destroyed) return false;
  if (state.game.level >= CONFIG.item.maxLevel) return false;
  return state.game.attempts > 0;
}

function secondsUntilAttempt() {
  if (!state.game?.nextAttemptAt) return 0;
  const remain = new Date(state.game.nextAttemptAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(remain / 1000));
}

function refillGameAttempts(game) {
  if (!game || game.attempts >= CONFIG.attempt.max || !game.nextAttemptAt) return false;

  let changed = false;
  let next = new Date(game.nextAttemptAt).getTime();
  if (!Number.isFinite(next)) {
    game.nextAttemptAt = null;
    return true;
  }

  const now = Date.now();
  const step = CONFIG.attempt.cooldownSeconds * 1000;

  while (next <= now && game.attempts < CONFIG.attempt.max) {
    game.attempts += 1;
    next += step;
    changed = true;
  }

  game.nextAttemptAt = game.attempts >= CONFIG.attempt.max ? null : new Date(next).toISOString();
  return changed;
}

function refillAttempts() {
  return refillGameAttempts(state.game);
}

async function saveGame() {
  if (!state.session || !state.profile || !state.game) return;
  saveLocalGame();
  const inventory = packedInventory(state.game);
  const { error } = await state.supabase.from("profiles").update({ inventory }).eq("id", state.profile.id);
  if (error) {
    setAuthError(error.message);
    return;
  }
  state.profile.inventory = inventory;
}

function queueSave() {
  saveLocalGame();
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(flushSave, BACKEND.storage.syncDebounceMs);
}

async function flushSave() {
  if (state.saveInFlight) {
    state.saveQueued = true;
    return;
  }

  state.saveInFlight = true;
  state.saveQueued = false;

  try {
    await saveGame();
  } finally {
    state.saveInFlight = false;
    if (state.saveQueued) queueSave();
  }
}

async function callFunction(name, body) {
  const { data, error } = await state.supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message || "관리자 작업에 실패했습니다.";
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

async function callGame2(action, body = {}) {
  const data = await callFunction("game2-action", { action, ...body });
  state.game2 = data.state;
  return data.state;
}

async function loadGame2() {
  if (!state.session) return;
  try {
    await callGame2("get");
    state.game2LastLoadAt = Date.now();
  } catch (error) {
    state.game2 = { error: error.message || "게임2 정보를 불러오지 못했습니다." };
  }
}

function subscribeGame2() {
  if (!state.supabase || state.game2Channel) return;
  state.game2Channel = state.supabase
    .channel("game2-state")
    .on("postgres_changes", { event: "*", schema: "public", table: "game2_state" }, async () => {
      await loadGame2();
      render();
    })
    .subscribe();
}

function setAuthError(message) {
  $("authError").textContent = message || "";
}

function showGame(loggedIn) {
  $("authView").classList.toggle("hidden", loggedIn);
  $("gameView").classList.toggle("hidden", !loggedIn);
}

function canAccessTitle2() {
  return isAdmin() || state.profile?.nickname === "미미";
}

function renderGameTabs() {
  const title2Allowed = canAccessTitle2();
  if (!title2Allowed && state.activeGame === "title2") {
    state.activeGame = "enhance";
  }

  document.querySelectorAll("[data-game-tab]").forEach((button) => {
    if (button.dataset.gameTab === "title2") {
      button.classList.toggle("hidden", !title2Allowed);
    }

    const active = button.dataset.gameTab === state.activeGame;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  $("enhanceGameView").classList.toggle("hidden", state.activeGame !== "enhance");
  $("title2GameView").classList.toggle("hidden", state.activeGame !== "title2");
}

function render() {
  const loggedIn = Boolean(state.session && state.profile && state.game);
  showGame(loggedIn);
  if (!loggedIn) return;

  $("profileName").textContent = state.profile.nickname;
  renderGameTabs();

  if (state.activeGame === "title2") {
    renderGame2();
    return;
  }

  if (state.activeGame !== "enhance") {
    return;
  }

  if (refillAttempts()) queueSave();
  const rule = currentRule();
  const chance = successChance();

  $("itemType").textContent = CONFIG.item.type;
  $("itemName").textContent = currentItemName();
  $("itemFlavor").textContent = CONFIG.item.flavor;
  $("levelText").textContent = `+${state.game.level}`;
  $("successRate").textContent = state.game.destroyed
    ? "파괴됨"
    : state.game.level >= CONFIG.item.maxLevel
      ? "완성"
      : `${chance.toFixed(1)}%`;
  $("bestLevel").textContent = `+${state.game.bestLevel}`;
  $("breakRateText").textContent = state.game.destroyed ? "파괴됨" : `${rule.destroyChance || 0}%`;
  $("attemptsText").textContent = `${state.game.attempts} / ${CONFIG.attempt.max}`;
  $("itemStateText").textContent = state.game.destroyed ? "파괴됨" : "정상";
  $("maxLevelText").textContent = `+${CONFIG.item.maxLevel}`;
  $("cooldownRuleText").textContent = `${CONFIG.attempt.cooldownSeconds}초마다 1회`;

  const remain = secondsUntilAttempt();
  $("cooldownText").textContent =
    state.game.attempts >= CONFIG.attempt.max
      ? "기회가 가득 찼습니다."
      : `다음 기회까지 ${remain}초`;

  $("enhanceBtn").disabled = !canEnhance();
  $("enhanceBtn").classList.toggle("hidden", state.game.destroyed);
  $("enhanceBtn").textContent = state.game.level >= CONFIG.item.maxLevel ? "최대 강화 완료" : "강화하기";
  $("restoreItemBtn").classList.toggle("hidden", !state.game.destroyed);
  $("adminDashboard").classList.toggle("hidden", !isAdmin());
  $("itemFrame").dataset.grade = gradeName(state.game.level);
  $("itemFrame").classList.toggle("destroyed", state.game.destroyed);

  renderHistory();
  renderAdminUsers();
}

function participantName(userId) {
  const participant = state.game2?.participants?.find((item) => item.id === userId);
  return participant?.nickname || "-";
}

function isGame2Participant() {
  return Boolean(state.game2?.participants?.some((item) => item.id === state.profile?.id));
}

function isGame2Holder() {
  return state.game2?.holderId === state.profile?.id;
}

function renderGame2() {
  const game = state.game2;
  $("game2Title").textContent = GAME2.title;
  $("game2TimeText").textContent = `${String(GAME2.startHour).padStart(2, "0")}:00 - ${String(GAME2.endHour).padStart(2, "0")}:00`;

  if (!game || game.error) {
    $("game2PhaseText").textContent = "대기";
    $("game2HolderName").textContent = "-";
    $("game2StatusText").textContent = game?.error || "게임2 정보를 불러오는 중입니다.";
    $("game2TurnText").textContent = "-";
    $("game2MyStateText").textContent = "-";
    $("game2JoinBtn").disabled = true;
    $("game2PassBtn").disabled = true;
    renderGame2Participants([]);
    renderGame2Targets([]);
    renderGame2Log([]);
    return;
  }

  const participants = game.participants || [];
  const joined = isGame2Participant();
  const holding = isGame2Holder();
  const statusLabels = {
    registration: "참여 접수",
    active: "진행 중",
    ended: "결과 정리",
  };
  const holderName = game.holderId ? participantName(game.holderId) : "아직 없음";

  $("game2PhaseText").textContent = statusLabels[game.status] || "대기";
  $("game2HolderName").textContent = holderName;
  $("game2TurnText").textContent = game.currentTurnLabel || "-";
  $("game2MyStateText").textContent = holding ? "내가 박스를 보유 중" : joined ? "참여 중" : "미참여";
  $("game2StatusText").textContent = game.message || "";
  $("game2JoinBtn").disabled = game.status !== "registration" || joined;
  $("game2JoinBtn").textContent = joined ? "참여 완료" : "참여하기";

  const passTargets = participants.filter((item) => item.id !== state.profile.id);
  const alreadyActed = game.lastActionTurn === game.currentTurn;
  renderGame2Targets(passTargets);
  $("game2PassBtn").disabled = game.status !== "active" || !holding || alreadyActed || passTargets.length === 0;

  renderGame2Participants(participants);
  renderGame2Log(game.log || []);
}

function renderGame2Participants(participants) {
  const list = $("game2Participants");
  list.innerHTML = "";

  if (participants.length === 0) {
    const empty = document.createElement("p");
    empty.className = "game2-empty";
    empty.textContent = "아직 참여자가 없습니다.";
    list.appendChild(empty);
    return;
  }

  participants.forEach((participant) => {
    const row = document.createElement("div");
    row.className = "game2-participant";
    row.classList.toggle("current", participant.id === state.game2?.holderId);

    const name = document.createElement("strong");
    const meta = document.createElement("span");
    name.textContent = participant.nickname;
    meta.textContent = participant.id === state.game2?.holderId ? `${GAME2.itemName} 보유` : "대기";
    row.append(name, meta);
    list.appendChild(row);
  });
}

function renderGame2Targets(participants) {
  const select = $("game2TargetSelect");
  select.innerHTML = "";

  if (participants.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "대상 없음";
    select.appendChild(option);
    return;
  }

  participants.forEach((participant) => {
    const option = document.createElement("option");
    option.value = participant.id;
    option.textContent = participant.nickname;
    select.appendChild(option);
  });
}

function renderGame2Log(log) {
  const list = $("game2Log");
  list.innerHTML = "";

  if (log.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "아직 진행 기록이 없습니다.";
    list.appendChild(empty);
    return;
  }

  log.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    list.appendChild(item);
  });
}

function isAdmin() {
  return Boolean(state.profile?.is_admin || state.profile?.nickname === "뚜비");
}

function gradeName(level) {
  if (level >= CONFIG.item.maxLevel) return "myth";
  return gradeInfo(level).grade;
}

function gradeInfo(level) {
  return CONFIG.gradeLabels.find((label) => level >= label.minLevel) || CONFIG.gradeLabels.at(-1);
}

function currentItemName() {
  if (state.game.destroyed) return `부서진 ${CONFIG.item.name}`;
  return currentRule().name || CONFIG.item.name;
}

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  const beforeCount = state.game.history.length;
  state.game.history = pruneHistory(state.game.history);
  if (state.game.history.length !== beforeCount) queueSave();
  list.classList.toggle("scrollable", state.game.history.length >= CONFIG.history.scrollAfter);

  if (state.game.history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "아직 강화 기록이 없습니다.";
    list.appendChild(empty);
    return;
  }

  state.game.history.forEach((entry) => {
    const item = document.createElement("li");
    item.className = entry.result;
    item.innerHTML = `
      <strong>${entry.title}</strong>
      <span>${entry.text}</span>
    `;
    list.appendChild(item);
  });
}

function renderAdminUsers() {
  const list = $("userList");
  if (!list || !isAdmin()) return;

  list.innerHTML = "";

  if (state.profiles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "가입 유저를 불러오는 중입니다.";
    list.appendChild(empty);
    return;
  }

  state.profiles.forEach((profile) => {
    const savedGame = readSavedGameFromProfile(profile);
    refillGameAttempts(savedGame);
    const row = document.createElement("article");
    row.className = "user-row";
    const info = document.createElement("div");
    const name = document.createElement("strong");
    const meta = document.createElement("span");
    const actions = document.createElement("div");
    const resetButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    actions.className = "user-actions";
    resetButton.type = "button";
    resetButton.className = "ghost compact";
    resetButton.dataset.action = "reset";
    resetButton.dataset.userId = profile.id;
    resetButton.textContent = "초기화";
    deleteButton.type = "button";
    deleteButton.className = "danger compact";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.userId = profile.id;
    deleteButton.textContent = "삭제";

    name.textContent = profile.nickname;
    const currentLevel = savedGame.destroyed ? "파괴됨" : `+${savedGame.level ?? 0}`;
    meta.textContent = `${currentLevel} 현재 / +${savedGame.bestLevel ?? 0} 최고 / ${savedGame.attempts ?? 0}회 남음`;
    info.append(name, meta);
    actions.append(resetButton, deleteButton);
    row.append(info, actions);
    list.appendChild(row);
  });
}

function readSavedGameFromProfile(profile) {
  const inventory = profile?.inventory;
  if (inventory && !Array.isArray(inventory) && inventory[SAVE_KEY]) {
    return normalizeGame(inventory[SAVE_KEY]);
  }
  return defaultGame();
}

function randomPick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pushHistory(entry) {
  state.game.history = pruneHistory([{ ...entry, createdAt: new Date().toISOString() }, ...state.game.history]);
}

async function enhance() {
  refillAttempts();
  if (!canEnhance()) {
    render();
    return;
  }

  const rule = currentRule();
  const before = state.game.level;
  const chance = successChance();
  const roll = Math.random() * 100;

  state.game.attempts -= 1;

  if (state.game.attempts < CONFIG.attempt.max && !state.game.nextAttemptAt) {
    state.game.nextAttemptAt = new Date(Date.now() + CONFIG.attempt.cooldownSeconds * 1000).toISOString();
  }

  if (roll < chance) {
    state.game.level = Math.min(CONFIG.item.maxLevel, state.game.level + 1);
    state.game.bestLevel = Math.max(state.game.bestLevel, state.game.level);
    pushHistory({
      result: "success",
      title: `+${before} → +${state.game.level} 성공`,
      text: randomPick(CONFIG.messages.success),
    });
  } else {
    const failureType = rollDestroy(rule) ? "destroy" : rule.fail;
    applyFailure(failureType);
    pushHistory({
      result: failureType,
      title: `+${before} 강화 실패`,
      text: randomPick(CONFIG.messages[failureType]),
    });
  }

  render();
  queueSave();
}

function rollDestroy(rule) {
  return Math.random() * 100 < (rule.destroyChance || 0);
}

function applyFailure(type) {
  if (type === "downgrade") {
    state.game.level = Math.max(0, state.game.level - 1);
  } else if (type === "crack") {
    state.game.level = Math.max(0, state.game.level - 2);
  } else if (type === "destroy") {
    state.game.level = 0;
    state.game.destroyed = true;
  }
}

async function adminResetGame() {
  if (!isAdmin()) return;
  state.game = defaultGame();
  render();
  queueSave();
}

async function restoreItem() {
  if (!state.game?.destroyed) return;
  state.game.level = 1;
  state.game.destroyed = false;
  state.game.bestLevel = Math.max(state.game.bestLevel || 0, 1);
  pushHistory({
    result: "system",
    title: "장비 복구",
    text: "파괴된 장비를 복구했다. 장비는 +1부터 다시 시작하고, 남은 기회는 유지된다.",
  });
  render();
  queueSave();
}

async function clearHistory() {
  state.game.history = [];
  render();
  queueSave();
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

async function loadProfile() {
  const { data, error } = await state.supabase
    .from("profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .single();
  if (error) throw error;
  state.profile = data;
  state.game = readSavedGame(data);
}

async function loadProfiles() {
  if (!isAdmin()) {
    state.profiles = [];
    return;
  }

  const { data, error } = await state.supabase
    .from("profiles")
    .select("id,nickname,is_admin,inventory,updated_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  state.profiles = data || [];
}

async function resetUserProfile(userId) {
  if (!isAdmin()) return;
  const target = state.profiles.find((profile) => profile.id === userId);
  if (!target) return;

  try {
    await callFunction("admin-manage-user", {
      action: "reset",
      target_user_id: userId,
    });
  } catch (error) {
    alert(error.message);
    return;
  }

  await loadProfiles();
  render();
}

async function deleteUserProfile(userId) {
  if (!isAdmin()) return;
  const target = state.profiles.find((profile) => profile.id === userId);
  if (!target) return;
  if (target.id === state.profile.id) {
    alert("현재 로그인한 내 계정은 여기서 삭제하지 않습니다.");
    return;
  }

  const ok = confirm(`${target.nickname} 유저 데이터를 삭제할까요?`);
  if (!ok) return;

  try {
    await callFunction("admin-manage-user", {
      action: "delete",
      target_user_id: userId,
    });
  } catch (error) {
    alert(error.message);
    return;
  }

  state.profiles = state.profiles.filter((profile) => profile.id !== userId);
  render();
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

  try {
    const result = mode === "register" ? await registerWithNickname(nickname, password) : await loginWithNickname(nickname, password);

    if (result.error) {
      setAuthError(result.error.message);
      return;
    }

    state.session = result.data.session;
    if (!state.session) {
      setAuthError("Supabase Auth에서 이메일 확인 기능을 꺼야 바로 로그인됩니다.");
      return;
    }

    await ensureProfile(nickname);
    await loadProfile();
    await loadProfiles();
    await loadGame2();
    subscribeGame2();
    await saveGame();
    render();
  } catch (err) {
    setAuthError(err.message || "로그인 처리 중 문제가 생겼습니다.");
  }
}

async function registerWithNickname(nickname, password) {
  return state.supabase.auth.signUp({
    email: nicknameEmail(nickname),
    password,
    options: { data: { nickname } },
  });
}

async function loginWithNickname(nickname, password) {
  const emails = [nicknameEmail(nickname), enhanceNicknameEmail(nickname)];
  let lastResult = null;

  for (const email of emails) {
    const result = await state.supabase.auth.signInWithPassword({ email, password });
    if (!result.error) return result;
    lastResult = result;
  }

  return lastResult;
}

async function init() {
  try {
    const config = getSupabaseConfig();
    state.supabase = window.supabase.createClient(config.url, config.key);
  } catch (err) {
    setAuthError(err.message);
    return;
  }

  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  if (state.session) {
    await loadProfile();
    await loadProfiles();
    await loadGame2();
    subscribeGame2();
  }
  render();

  state.tick = window.setInterval(async () => {
    if (refillAttempts()) queueSave();
    if (state.activeGame === "title2" && Date.now() - state.game2LastLoadAt > 30000) await loadGame2();
    render();
  }, 1000);
}

$("authForm").addEventListener("submit", (event) => {
  event.preventDefault();
  auth("login");
});

$("registerBtn").addEventListener("click", () => auth("register"));
$("enhanceBtn").addEventListener("click", enhance);
$("restoreItemBtn").addEventListener("click", restoreItem);
$("adminResetBtn").addEventListener("click", adminResetGame);
$("refreshUsersBtn").addEventListener("click", async () => {
  await loadProfiles();
  render();
});
$("userList").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const userId = button.dataset.userId;
  if (button.dataset.action === "reset") await resetUserProfile(userId);
  if (button.dataset.action === "delete") await deleteUserProfile(userId);
});
$("clearLogBtn").addEventListener("click", clearHistory);
$("game2JoinBtn").addEventListener("click", async () => {
  try {
    await callGame2("join");
    render();
  } catch (error) {
    alert(error.message || "게임2 참여에 실패했습니다.");
  }
});
$("game2PassBtn").addEventListener("click", async () => {
  const targetUserId = $("game2TargetSelect").value;
  if (!targetUserId) return;
  try {
    await callGame2("pass", { target_user_id: targetUserId });
    render();
  } catch (error) {
    alert(error.message || "박스 넘기기에 실패했습니다.");
  }
});
$("game2RefreshBtn").addEventListener("click", async () => {
  await loadGame2();
  render();
});
document.querySelectorAll("[data-game-tab]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.dataset.gameTab === "title2" && !canAccessTitle2()) return;
    state.activeGame = button.dataset.gameTab;
    if (state.activeGame === "title2") await loadGame2();
    render();
  });
});
$("logoutBtn").addEventListener("click", async () => {
  await flushSave();
  if (state.game2Channel) {
    await state.supabase.removeChannel(state.game2Channel);
    state.game2Channel = null;
  }
  await state.supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  state.game = null;
  state.game2 = null;
  showGame(false);
});

init();
