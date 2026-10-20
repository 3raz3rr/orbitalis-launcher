const state = {
  user: null,
  featured: false,
  discord: false,
  devBypass: false,
  catalog: [],
  mine: [],
  selectedCatalog: null,
  selectedMine: null,
  view: "home",
};

const who = document.getElementById("who");
const form = document.getElementById("form");

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  if (response.status === 401 && path === "/api/me") return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Ошибка ${response.status}`);
  }
  return data;
}

function show(view) {
  state.view = view;
  for (const name of ["home", "servers", "mine"]) {
    document.getElementById(`view-${name}`).hidden = name !== view;
    document.querySelector(`[data-nav="${name}"]`).classList.toggle("active", name === view);
  }
  if (view === "servers") renderCatalog();
  if (view === "mine") renderMine();
}

function authLabel(mode) {
  return mode === "discord" ? "Discord" : "ключ BYOND";
}

function renderWho() {
  who.innerHTML = "";
  if (state.user) {
    const name = document.createElement("span");
    name.textContent = state.user.globalName || state.user.username || "Аккаунт";
    const out = document.createElement("button");
    out.type = "button";
    out.textContent = "Выйти";
    out.addEventListener("click", async () => {
      await api("/api/logout", { method: "POST" });
      state.user = null;
      state.mine = [];
      renderWho();
      show("home");
    });
    who.append(name, out);
    return;
  }
  if (state.discord) {
    const link = document.createElement("a");
    link.className = "btn primary";
    link.href = "/auth/discord";
    link.textContent = "Войти через Discord";
    who.append(link);
  }
  if (state.devBypass) {
    const dev = document.createElement("button");
    dev.type = "button";
    dev.id = "dev-login";
    dev.textContent = state.discord ? "Локальный вход" : "Войти локально";
    dev.addEventListener("click", async () => {
      await api("/api/dev/login", { method: "POST" });
      await loadSession();
      show("mine");
    });
    who.append(dev);
  }
}

function renderCatalog() {
  const list = document.getElementById("catalog");
  const stage = document.getElementById("stage");
  const copy = document.getElementById("stage-copy");
  list.innerHTML = "";
  if (!state.catalog.length) {
    stage.className = "stage theme-plain";
    copy.innerHTML = "<h2>Пока пусто</h2><p>Серверы появятся, когда владельцы добавят их в кабинете.</p>";
    return;
  }
  if (!state.catalog.some((server) => server.id === state.selectedCatalog)) {
    state.selectedCatalog = state.catalog[0].id;
  }
  const current = state.catalog.find((server) => server.id === state.selectedCatalog);
  stage.className = `stage theme-${current.background === "grimrock" ? "grimrock" : current.background === "orbitalis" ? "orbitalis" : "plain"}`;
  const status = current.status;
  const statusLine = status
    ? `${status.mapName || "Карта не передана"} · ${status.players ?? "?"} онлайн`
    : "Нет свежего статуса";
  copy.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = current.name;
  const text = document.createElement("p");
  text.textContent = `${current.host}:${current.port} · BYOND ${current.byondMajor} · ${authLabel(current.authMode)} · ${statusLine}`;
  copy.append(title, text);
  if (current.live) {
    const live = document.createElement("p");
    live.className = "live";
    live.textContent = "сервер на связи";
    copy.append(live);
  }

  for (const server of state.catalog) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "server" + (server.id === current.id ? " current" : "");
    const name = document.createElement("span");
    name.textContent = server.name;
    const meta = document.createElement("small");
    meta.textContent = server.live ? `${server.status?.players ?? 0} онлайн` : "нет статуса";
    button.append(name, meta);
    button.addEventListener("click", () => {
      state.selectedCatalog = server.id;
      renderCatalog();
    });
    list.append(button);
  }
}

function fillForm(server) {
  form.hidden = !state.user;
  document.getElementById("gate").hidden = Boolean(state.user);
  form.name.value = server?.name || "";
  form.host.value = server?.host || "";
  form.port.value = server?.port || 2506;
  form.byondMajor.value = String(server?.byondMajor || 516);
  form.authMode.value = server?.authMode || "discord";
  form.background.value = server?.background || "plain";
  form.role.value = server?.role || "guest";
  const locked = !state.featured;
  for (const option of document.getElementById("role").options) {
    option.disabled = locked && option.value !== "guest" && option.value !== server?.role;
  }
  document.getElementById("role-hint").hidden = state.featured;
  document.getElementById("remove").hidden = !server;
  const box = document.getElementById("token-box");
  box.hidden = !server?.token;
  document.getElementById("token").textContent = server?.token || "";
  document.getElementById("error").hidden = true;
}

function renderMine() {
  const list = document.getElementById("mine-list");
  list.innerHTML = "";
  if (!state.user) {
    fillForm(null);
    form.hidden = true;
    return;
  }
  for (const server of state.mine) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mine-item" + (server.id === state.selectedMine ? " current" : "");
    const name = document.createElement("span");
    name.textContent = server.name;
    const meta = document.createElement("small");
    meta.textContent = `${server.host}:${server.port}`;
    button.append(name, meta);
    button.addEventListener("click", () => {
      state.selectedMine = server.id;
      fillForm(server);
      renderMine();
    });
    list.append(button);
  }
  const current = state.mine.find((server) => server.id === state.selectedMine) || null;
  fillForm(current);
}

function showError(message) {
  const error = document.getElementById("error");
  error.hidden = !message;
  error.textContent = message || "";
}

async function loadSession() {
  const me = await api("/api/me");
  state.user = me?.user || null;
  state.featured = Boolean(me?.featured);
  if (state.user) {
    const mine = await api("/api/mine");
    state.mine = mine.servers;
  }
  renderWho();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = {
    name: form.name.value,
    host: form.host.value,
    port: Number(form.port.value),
    byondMajor: Number(form.byondMajor.value),
    authMode: form.authMode.value,
    background: form.background.value,
    role: form.role.value,
  };
  try {
    const path = state.selectedMine ? `/api/servers/${state.selectedMine}` : "/api/servers";
    const method = state.selectedMine ? "PATCH" : "POST";
    const data = await api(path, { method, body: JSON.stringify(body) });
    state.selectedMine = data.server.id;
    state.catalog = (await api("/api/catalog")).servers;
    await loadSession();
    renderMine();
  } catch (error) {
    showError(error.message);
  }
});

document.getElementById("new-server").addEventListener("click", () => {
  state.selectedMine = null;
  fillForm(null);
  renderMine();
});

document.getElementById("remove").addEventListener("click", async () => {
  if (!state.selectedMine || !window.confirm("Удалить сервер?")) return;
  await api(`/api/servers/${state.selectedMine}`, { method: "DELETE" });
  state.selectedMine = null;
  state.catalog = (await api("/api/catalog")).servers;
  await loadSession();
  renderMine();
});

document.getElementById("rotate").addEventListener("click", async () => {
  if (!state.selectedMine) return;
  await api(`/api/servers/${state.selectedMine}/token`, { method: "POST" });
  await loadSession();
  renderMine();
});

document.getElementById("download").addEventListener("click", async () => {
  if (!state.selectedMine) return;
  const response = await fetch(`/api/servers/${state.selectedMine}/package`, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    showError("Не удалось скачать пакет");
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "orbitalis_bridge.dm";
  link.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("hashchange", () => {
  const view = location.hash.replace("#", "") || "home";
  show(["servers", "mine"].includes(view) ? view : "home");
});

async function boot() {
  const health = await api("/api/health");
  state.discord = Boolean(health.discord);
  state.devBypass = Boolean(health.devBypass);
  state.catalog = (await api("/api/catalog")).servers;
  await loadSession();
  const view = location.hash.replace("#", "") || "home";
  show(["servers", "mine"].includes(view) ? view : "home");
}

boot();
