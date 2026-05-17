const BACKEND = window.ENHANCE_BACKEND_DATA;
const CONFIG = BACKEND.game;
const SAVE_KEY = BACKEND.storage.saveKey;

const $ = (id) => document.getElementById(id);

const state = {
  supabase: null,
  session: null,
  profile: null,
  game: null,
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
    version: BACKEND.version,
  };
}

function normalizeGame(saved) {
  const base = defaultGame();
  return {
    ...base,
    ...(saved || {}),
    attempts: Math.min(saved?.attempts ?? base.attempts, CONFIG.attempt.max),
    destroyed: Boolean(saved?.destroyed ?? base.destroyed),
    history: Array.isArray(saved?.history) ? saved.history.slice(0, 30) : [],
  };
}

function readSavedGame(profile) {
  const local = readLocalGame(profile?.id);
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

function readLocalGame(userId) {
  const key = localCacheKey(userId);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? normalizeGame(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveLocalGame() {
  const key = localCacheKey();
  if (!key || !state.game) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(state.game));
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

function currentRule() {
  return CONFIG.levels.find((rule) => rule.level === state.game.level) || CONFIG.levels.at(-1);
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

function refillAttempts() {
  if (!state.game || state.game.attempts >= CONFIG.attempt.max || !state.game.nextAttemptAt) return false;

  let changed = false;
  let next = new Date(state.game.nextAttemptAt).getTime();
  const now = Date.now();
  const step = CONFIG.attempt.cooldownSeconds * 1000;

  while (next <= now && state.game.attempts < CONFIG.attempt.max) {
    state.game.attempts += 1;
    next += step;
    changed = true;
  }

  state.game.nextAttemptAt = state.game.attempts >= CONFIG.attempt.max ? null : new Date(next).toISOString();
  return changed;
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

function setAuthError(message) {
  $("authError").textContent = message || "";
}

function showGame(loggedIn) {
  $("authView").classList.toggle("hidden", loggedIn);
  $("gameView").classList.toggle("hidden", !loggedIn);
}

function render() {
  const loggedIn = Boolean(state.session && state.profile && state.game);
  showGame(loggedIn);
  if (!loggedIn) return;

  refillAttempts();
  const chance = successChance();

  $("profileName").textContent = state.profile.nickname;
  $("itemType").textContent = CONFIG.item.type;
  $("itemName").textContent = CONFIG.item.name;
  $("itemFlavor").textContent = CONFIG.item.flavor;
  $("levelText").textContent = `+${state.game.level}`;
  $("successRate").textContent = state.game.destroyed
    ? "파괴됨"
    : state.game.level >= CONFIG.item.maxLevel
      ? "완성"
      : `${chance.toFixed(1)}%`;
  $("bestLevel").textContent = `+${state.game.bestLevel}`;
  $("gradeText").textContent = state.game.destroyed ? "파괴" : gradeLabel(state.game.level);
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
  $("newItemBtn").classList.toggle("hidden", !state.game.destroyed);
  $("adminResetBtn").classList.toggle("hidden", !isAdmin());
  $("itemFrame").dataset.grade = gradeName(state.game.level);
  $("itemFrame").classList.toggle("destroyed", state.game.destroyed);

  renderHistory();
}

function isAdmin() {
  return Boolean(state.profile?.is_admin || state.profile?.nickname === "뚜비");
}

function gradeName(level) {
  if (level >= CONFIG.item.maxLevel) return "myth";
  return gradeInfo(level).grade;
}

function gradeLabel(level) {
  return gradeInfo(level).text;
}

function gradeInfo(level) {
  return CONFIG.gradeLabels.find((label) => level >= label.minLevel) || CONFIG.gradeLabels.at(-1);
}

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";

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

function randomPick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pushHistory(entry) {
  state.game.history = [entry, ...state.game.history].slice(0, 30);
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

async function receiveNewItem() {
  if (!state.game?.destroyed) return;
  state.game.level = 0;
  state.game.destroyed = false;
  pushHistory({
    result: "system",
    title: "새 장비 지급",
    text: "파괴된 장비를 버리고 새 장비를 받았다. 남은 기회는 유지된다.",
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
  if (state.session) await loadProfile();
  render();

  state.tick = window.setInterval(async () => {
    if (refillAttempts()) queueSave();
    render();
  }, 1000);
}

$("authForm").addEventListener("submit", (event) => {
  event.preventDefault();
  auth("login");
});

$("registerBtn").addEventListener("click", () => auth("register"));
$("enhanceBtn").addEventListener("click", enhance);
$("newItemBtn").addEventListener("click", receiveNewItem);
$("adminResetBtn").addEventListener("click", adminResetGame);
$("clearLogBtn").addEventListener("click", clearHistory);
$("logoutBtn").addEventListener("click", async () => {
  await flushSave();
  await state.supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  state.game = null;
  showGame(false);
});

init();
