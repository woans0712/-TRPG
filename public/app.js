const statusPanel = document.querySelector(".status-panel");

function getSupabaseConfig() {
  return {
    url: window.TRPG_SUPABASE_URL || "",
    key: window.TRPG_SUPABASE_ANON_KEY || "",
  };
}

function renderConnectionStatus() {
  const config = getSupabaseConfig();
  const ready =
    Boolean(config.url) &&
    Boolean(config.key) &&
    !config.url.includes("YOUR_") &&
    !config.key.includes("YOUR_");

  if (!statusPanel) return;

  const badge = document.createElement("p");
  badge.className = ready ? "connection good" : "connection warn";
  badge.textContent = ready
    ? "Supabase 공개 연결 정보가 남아 있습니다."
    : "Supabase 공개 연결 정보를 확인해야 합니다.";
  statusPanel.appendChild(badge);
}

renderConnectionStatus();
