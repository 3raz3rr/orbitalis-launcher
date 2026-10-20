const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const dns = require("dns");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { execFile, spawn } = require("child_process");
const { getNewsFeeds } = require("./newsService");
const { topicRttMs, topicRequest, parseByondParams } = require("./byondProbe");
const {
  isByondNoAdPatched,
  buildPatchedBuffers,
  writePatchedFiles,
  readByondVersion,
  getPatchTarget,
} = require("./byondPatch");
const {
  loadAuthConfig,
  saveSessionToken,
  readSessionToken,
  clearSessionToken,
  startDiscordLogin,
  fetchMe,
  logoutRemote,
  fetchServerStatus,
  fetchPlayerCard,
  parseAuthProtocolUrl,
} = require("./authClient");
const {
  loadLogsConfig,
  logsMe,
  logsTree,
  logsRound,
  logsGenerate,
  logsView,
} = require("./logsClient");
const {
  loadMusicConfig,
  musicMe,
  musicLibrary,
  musicPlaylistGet,
  musicPlaylistPut,
  musicDeleteTrack,
  musicPatchTrack,
  musicImportUrl,
  musicUpload,
  musicDownloadToTemp,
} = require("./musicClient");
const { lookupIpv4First, lookupAsync } = require("./hostResolve");
const gameSession = require("./gameSession");
const discordPresence = require("./discordPresence");

const dnsLookup = dns.promises.lookup;
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // older Node
}
const PROTOCOL = "orbitalis";
const APPLY_UPDATE_FLAG = "--orbitalis-apply-update";
const AUTH_CONFIG = loadAuthConfig();
const LOGS_CONFIG = loadLogsConfig();
const MUSIC_CONFIG = loadMusicConfig();

let mainWindow = null;
const LAUNCHER_STARTED_AT = Date.now();
const DISCORD_CLIENT_ID =
  AUTH_CONFIG.discordClientId || "1052259698457464926";
let launchInFlight = false;
let presenceContext = { game: "orbitalis", view: "worlds" };
const lastStatusByKind = {};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseApplyUpdateArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (!args.includes(APPLY_UPDATE_FLAG)) {
    return null;
  }
  const read = (prefix) => {
    const hit = args.find((a) => String(a).startsWith(prefix));
    return hit ? String(hit).slice(prefix.length) : "";
  };
  const pid = Number(read("--orbitalis-update-pid="));
  const targetPath = read("--orbitalis-update-target=");
  const sourcePath = read("--orbitalis-update-source=");
  if (!Number.isFinite(pid) || pid <= 0 || !targetPath || !sourcePath) {
    return null;
  }
  return { pid, targetPath, sourcePath };
}

function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPidExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidExists(pid)) {
      return true;
    }
    await sleep(400);
  }
  try {
    process.kill(pid);
  } catch {
    // ignore
  }
  await sleep(1000);
  return !pidExists(pid);
}

function appendUpdateLog(logPath, message) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\r\n`;
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    // ignore
  }
}

async function runApplyUpdate({ pid, targetPath, sourcePath }) {
  const logPath = path.join(
    app.getPath("temp"),
    `orbitalis-update-apply-${Date.now()}.log`
  );
  appendUpdateLog(logPath, `start pid=${pid}`);
  appendUpdateLog(logPath, `source=${sourcePath}`);
  appendUpdateLog(logPath, `target=${targetPath}`);

  await waitForPidExit(pid, 90_000);
  appendUpdateLog(logPath, "pid_exited");

  if (!fs.existsSync(sourcePath)) {
    appendUpdateLog(logPath, "ERROR missing source exe");
    return { ok: false, logPath };
  }

  const oldPath = `${targetPath}.old`;
  let replaced = false;
  for (let i = 1; i <= 25; i += 1) {
    try {
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
      if (fs.existsSync(targetPath)) {
        fs.renameSync(targetPath, oldPath);
      }
      fs.copyFileSync(sourcePath, targetPath);
      const newLen = fs.statSync(sourcePath).size;
      const curLen = fs.statSync(targetPath).size;
      if (newLen === curLen) {
        replaced = true;
        appendUpdateLog(logPath, `replaced ok attempt=${i}`);
        break;
      }
    } catch (error) {
      appendUpdateLog(
        logPath,
        `replace fail attempt=${i} ${error?.message || error}`
      );
    }
    await sleep(1000);
  }

  const launchPath = replaced ? targetPath : sourcePath;
  appendUpdateLog(logPath, `launch=${launchPath}`);
  try {
    spawn(launchPath, [], {
      detached: true,
      stdio: "ignore",
      cwd: path.dirname(launchPath),
    }).unref();
  } catch (error) {
    appendUpdateLog(logPath, `launch fail ${error?.message || error}`);
  }

  if (replaced) {
    try {
      fs.unlinkSync(sourcePath);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(oldPath);
    } catch {
      // ignore
    }
  }
  appendUpdateLog(logPath, "done");
  return { ok: replaced, logPath };
}

const pendingApplyUpdate = parseApplyUpdateArgs(process.argv);

const SERVERS = {
  mainDirect: {
    id: "mainDirect",
    kind: "main",
    game: "orbitalis",
    route: "direct",
    label: "Прямой вход",
    labelEn: "Direct",
    host: "play.hornyjail.space",
    port: 41060,
    url: "byond://play.hornyjail.space:41060",
    hint: "Лучший пинг. Если заходит - играй так.",
  },
  mainProxy: {
    id: "mainProxy",
    kind: "main",
    game: "orbitalis",
    route: "proxy",
    label: "Через прокси",
    labelEn: "Proxy",
    host: "proxy.hornyjail.space",
    port: 41060,
    url: "byond://proxy.hornyjail.space:41060",
    hint: "Германия. Для UA и кого режет прямой маршрут.",
  },
  devDirect: {
    id: "devDirect",
    kind: "dev",
    game: "orbitalis",
    route: "direct",
    label: "DEV прямой",
    labelEn: "DEV Direct",
    host: "play.hornyjail.space",
    port: 41080,
    url: "byond://play.hornyjail.space:41080",
    hint: "Тестовый сервер, напрямую.",
  },
  devProxy: {
    id: "devProxy",
    kind: "dev",
    game: "orbitalis",
    route: "proxy",
    label: "DEV прокси",
    labelEn: "DEV Proxy",
    host: "proxy.hornyjail.space",
    port: 41080,
    url: "byond://proxy.hornyjail.space:41080",
    hint: "Тестовый сервер через прокси.",
  },
  grimDirect: {
    id: "grimDirect",
    kind: "grim",
    game: "grimrock",
    route: "direct",
    label: "Grimrock прямой",
    labelEn: "Grimrock Direct",
    host: "play.hornyjail.space",
    port: 41100,
    url: "byond://play.hornyjail.space:41100",
    hint: "Рога. Прямой вход.",
  },
  grimProxy: {
    id: "grimProxy",
    kind: "grim",
    game: "grimrock",
    route: "proxy",
    label: "Grimrock прокси",
    labelEn: "Grimrock Proxy",
    host: "proxy.hornyjail.space",
    port: 41100,
    url: "byond://proxy.hornyjail.space:41100",
    hint: "Рога через Германию. Для UA и кого режет прямой маршрут.",
  },
};

function gameIdOf(server) {
  if (!server) {
    return "orbitalis";
  }
  if (server.game) {
    return server.game;
  }
  return server.kind === "grim" ? "grimrock" : "orbitalis";
}

function presenceGameOf(server, fallbackGame) {
  if (server?.kind === "dev") {
    return "dev";
  }
  const game = server ? gameIdOf(server) : fallbackGame;
  if (game === "grimrock") {
    return "grimrock";
  }
  if (game === "dev") {
    return "dev";
  }
  return "orbitalis";
}

function statusKindOfSession(session) {
  const server = SERVERS[session?.serverId];
  if (server?.kind === "dev") {
    return "dev";
  }
  if (server?.kind === "grim" || session?.game === "grimrock") {
    return "grim";
  }
  return "main";
}

function rememberStatusPayload(kind, payload) {
  if (payload?.ok) {
    lastStatusByKind[kind] = payload;
  }
}

function refreshDiscordPresence() {
  const session = gameSession.getSession();
  if (session.running || session.launching) {
    const server = SERVERS[session.serverId];
    const kind = statusKindOfSession(session);
    const payload = lastStatusByKind[kind];
    discordPresence.setActivity(
      discordPresence.buildPlayingActivity({
        game: presenceGameOf(server, session.game),
        label: session.label,
        status: payload?.ok ? payload.status : null,
        startedAt: session.startedAt || LAUNCHER_STARTED_AT,
      })
    );
    return;
  }
  discordPresence.setActivity(
    discordPresence.buildLauncherActivity({
      game: presenceContext.game,
      view: presenceContext.view,
      startedAt: LAUNCHER_STARTED_AT,
    })
  );
}

function emitGameSession(session) {
  sendToRenderer("game-session", session || gameSession.getSession());
  refreshDiscordPresence();
}

const LINKS = {
  wiki: "https://mediawiki.hornyjail.space/",
  boosty: "https://boosty.to/meiday",
  byond: "https://www.byond.com/download/",
  discord: "https://discord.gg/uj8HN4GB7s",
};

function prefsPath() {
  return path.join(app.getPath("userData"), "launcher-prefs.json");
}

function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch, updatedAt: Date.now() };
  for (const key of Object.keys(next)) {
    if (next[key] === null || next[key] === undefined) {
      delete next[key];
    }
  }
  fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
  fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const iconPath = [
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(__dirname, "..", "assets", "icon.ico"),
    path.join(__dirname, "assets", "logo.png"),
  ].find((candidate) => fs.existsSync(candidate));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 740,
    backgroundColor: "#05080f",
    title: "Orbitalis",
    show: false,
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function focusMainWindow() {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function cacheAuthUser(user) {
  if (!user) {
    writePrefs({ lastAuthUser: null });
    return;
  }
  if (user.provisional) return;
  const id = user.id || null;
  const avatar = user.avatar || null;
  const avatarUrl =
    user.avatarUrl ||
    (id && avatar
      ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
      : null);
  writePrefs({
    lastAuthUser: {
      id,
      username: user.username || null,
      globalName: user.globalName || user.global_name || null,
      avatar,
      avatarUrl,
      inGuild: Boolean(user.inGuild),
    },
  });
}

function provisionalAuthUser(cached) {
  if (cached && cached.id) return { ...cached, provisional: !cached.username };
  return {
    id: "session",
    username: "Discord",
    globalName: "Аккаунт",
    provisional: true,
  };
}

async function resolveAuthUser() {
  const token = readSessionToken(app.getPath("userData"));
  if (!token || !AUTH_CONFIG.authApiUrl) {
    return { user: null, configured: Boolean(AUTH_CONFIG.authApiUrl) };
  }
  try {
    const result = await fetchMe(AUTH_CONFIG.authApiUrl, token, {
      timeoutMs: 6000,
    });
    if (!result.ok) {
      clearSessionToken(app.getPath("userData"));
      cacheAuthUser(null);
      return { user: null, configured: true };
    }
    cacheAuthUser(result.user);
    return { user: result.user, configured: true, expiresAt: result.expiresAt };
  } catch {
    return { user: null, configured: true, offline: true };
  }
}

async function handleAuthProtocolUrl(urlString) {
  const parsed = parseAuthProtocolUrl(urlString);
  if (!parsed?.token) {
    return { ok: false, error: "bad_auth_url" };
  }
  saveSessionToken(app.getPath("userData"), parsed.token);
  try {
    const result = await fetchMe(AUTH_CONFIG.authApiUrl, parsed.token);
    if (!result.ok) {
      clearSessionToken(app.getPath("userData"));
      sendToRenderer("auth-changed", { user: null, error: "session_invalid" });
      return { ok: false, error: "session_invalid" };
    }
    cacheAuthUser(result.user);
    sendToRenderer("auth-changed", {
      user: result.user,
      expiresAt: result.expiresAt,
    });
    focusMainWindow();
    return { ok: true, user: result.user };
  } catch (error) {
    sendToRenderer("auth-changed", {
      user: null,
      error: error?.message || String(error),
    });
    return { ok: false, error: error?.message || String(error) };
  }
}

function registerProtocolClient() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

if (pendingApplyUpdate) {
  // Apply mode must not take the single-instance lock or open UI.
  app
    .whenReady()
    .then(() => runApplyUpdate(pendingApplyUpdate))
    .catch(() => {})
    .finally(() => app.exit(0));
} else {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on("second-instance", (_event, argv) => {
      const url = argv.find((arg) => String(arg).startsWith(`${PROTOCOL}://`));
      if (url) {
        handleAuthProtocolUrl(url);
      }
      focusMainWindow();
    });
  }
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleAuthProtocolUrl(url);
});

function listDriveRoots() {
  const roots = [];
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(root)) {
        roots.push(root);
      }
    } catch {
      // ignore inaccessible drives
    }
  }
  return roots;
}

function readRegistryByondInstallDirs() {
  const dirs = [];
  if (process.platform !== "win32") {
    return dirs;
  }
  const keys = [
    "HKCU\\Software\\BYOND",
    "HKLM\\SOFTWARE\\BYOND",
    "HKLM\\SOFTWARE\\WOW6432Node\\BYOND",
  ];
  for (const key of keys) {
    try {
      const raw = require("child_process")
        .execFileSync("reg", ["query", key, "/s"], {
          encoding: "utf8",
          windowsHide: true,
          timeout: 3000,
        })
        .toString();
      const matches = raw.matchAll(/REG_SZ\s+(.+)$/gm);
      for (const match of matches) {
        const value = String(match[1] || "").trim().replace(/^"|"$/g, "");
        if (!value) continue;
        if (/byond\.exe$|dreamseeker\.exe$/i.test(value)) {
          dirs.push(path.dirname(value));
        } else if (/[\\/]BYOND([\\/]|$)/i.test(value) || /byond/i.test(value)) {
          dirs.push(value);
          dirs.push(path.join(value, "bin"));
        }
      }
    } catch {
      // key missing / reg unavailable
    }
  }
  return dirs;
}

function resolveByondExe(candidatePath) {
  if (!candidatePath) {
    return null;
  }
  const resolved = path.resolve(candidatePath);
  if (!fs.existsSync(resolved)) {
    return null;
  }
  const base = path.basename(resolved).toLowerCase();
  if (base === "dreamseeker.exe" || base === "byond.exe") {
    return resolved;
  }
  // User picked a folder or random exe inside BYOND tree
  const asDir = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  const nest = [
    path.join(asDir, "dreamseeker.exe"),
    path.join(asDir, "byond.exe"),
    path.join(asDir, "bin", "dreamseeker.exe"),
    path.join(asDir, "bin", "byond.exe"),
  ];
  for (const file of nest) {
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return null;
}

function byondCandidates() {
  const localApp = process.env.LOCALAPPDATA || "";
  const userProfile = process.env.USERPROFILE || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const roots = new Set([
    path.join(localApp, "BYOND"),
    path.join(userProfile, "BYOND"),
    path.join(programFiles, "BYOND"),
    path.join(programFilesX86, "BYOND"),
  ]);

  for (const drive of listDriveRoots()) {
    roots.add(path.join(drive, "Program Files", "BYOND"));
    roots.add(path.join(drive, "Program Files (x86)", "BYOND"));
    roots.add(path.join(drive, "BYOND"));
    roots.add(path.join(drive, "Games", "BYOND"));
    roots.add(path.join(drive, "Games", "byond"));
  }

  for (const dir of readRegistryByondInstallDirs()) {
    roots.add(dir);
    roots.add(path.dirname(dir));
  }

  const out = [];
  for (const root of roots) {
    out.push(path.join(root, "bin", "dreamseeker.exe"));
    out.push(path.join(root, "bin", "byond.exe"));
    out.push(path.join(root, "dreamseeker.exe"));
    out.push(path.join(root, "byond.exe"));
  }

  // PATH lookup
  try {
    const whereOut = require("child_process")
      .execFileSync("where", ["dreamseeker.exe"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 3000,
      })
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    out.push(...whereOut);
  } catch {
    // not on PATH
  }

  return out;
}

function findByond() {
  const prefs = readPrefs();
  const preferred = resolveByondExe(prefs.byondPath);
  if (preferred) {
    return preferred;
  }

  for (const candidate of byondCandidates()) {
    const hit = resolveByondExe(candidate);
    if (hit) {
      return hit;
    }
  }
  return null;
}

function resolveByondPager(byondPath) {
  if (!byondPath) {
    return null;
  }
  const pager = path.join(path.dirname(byondPath), "byond.exe");
  return fs.existsSync(pager) ? pager : null;
}

function spawnDreamseeker(byondPath, url) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    try {
      // Detached spawn so DreamSeeker runs independently. We intentionally
      // only react to a spawn failure ("error" event), NOT to the process
      // exiting - otherwise closing DreamSeeker would re-trigger the launch
      // (via the fallback below) and reopen the game.
      const child = spawn(byondPath, [url], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => {
        shell
          .openExternal(url)
          .then(() => finish({ ok: true, method: "protocol", byondPath }))
          .catch(() =>
            finish({ ok: false, error: "Не удалось запустить BYOND", byondPath })
          );
      });
      child.unref();
      // If no spawn error arrives shortly, treat the launch as successful.
      setTimeout(() => finish({ ok: true, method: "exec", byondPath }), 500);
    } catch (error) {
      shell
        .openExternal(url)
        .then(() => finish({ ok: true, method: "protocol", byondPath }))
        .catch(() =>
          finish({ ok: false, error: error?.message || "Ошибка запуска", byondPath })
        );
    }
  });
}

async function launchByondUrl(url) {
  const byondPath = findByond();
  if (!byondPath) {
    return shell.openExternal(url).then(() => ({
      ok: true,
      method: "protocol",
      byondPath: null,
    }));
  }

  // If BYOND isn't running yet, start the pager first so the client is up and
  // the account session is ready, then join the game.
  try {
    if (listRunningByondProcesses().length === 0) {
      const pager = resolveByondPager(byondPath);
      if (pager) {
        const pagerChild = spawn(pager, [], { detached: true, stdio: "ignore" });
        pagerChild.on("error", () => {});
        pagerChild.unref();
        await new Promise((r) => setTimeout(r, 1600));
      }
    }
  } catch {
    // If process detection or the pager launch fails, just try to connect.
  }

  return spawnDreamseeker(byondPath, url);
}

function hrMs(started) {
  return Number(process.hrtime.bigint() - started) / 1e6;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function tcpConnectMs(ip, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    let started = null;

    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      const ms = started ? hrMs(started) : null;
      try {
        socket.removeAllListeners();
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok && ms != null ? Math.max(1, Math.round(ms)) : null);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    started = process.hrtime.bigint();
    socket.connect({ port, host: ip });
  });
}

/** TTFB through HTTP relay (proxy:50080 -> origin). Full path, not just DE edge. */
function httpTtfbMs(ip, port = 50080, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const req = http.request(
      {
        host: ip,
        port,
        path: "/",
        method: "HEAD",
        timeout: timeoutMs,
        headers: { Connection: "close", "User-Agent": "OrbitalisLauncher" },
      },
      (res) => {
        res.resume();
        resolve(Math.max(1, Math.round(hrMs(started))));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

async function probeServer(server, samples = 1) {
  const { host, port, route } = server;
  let ip;
  try {
    // Timed DNS + static fallback — avoids multi-second EAI_AGAIN stalls.
    const looked = await lookupAsync(host, 1000);
    ip = looked.address;
  } catch {
    return { ok: false, ms: null, host, port, ip: null, method: null };
  }

  // Direct: Topic RTT (real DD), not bare TCP accept (can look like 1-5ms falsely).
  if (route === "direct") {
    const topicSamples = [];
    for (let i = 0; i < samples; i += 1) {
      const ms = await topicRttMs(ip, port, 1200);
      if (ms == null) {
        // Fail-fast: DD likely doesn't answer Topic — don't burn more timeouts.
        break;
      }
      topicSamples.push(ms);
    }
    if (topicSamples.length) {
      return {
        ok: true,
        ms: Math.round(median(topicSamples)),
        host,
        port,
        ip,
        method: "topic",
        samples: topicSamples,
      };
    }
    // Fallback TCP if Topic blocked / unsupported
    const tcpSamples = [];
    for (let i = 0; i < samples; i += 1) {
      const ms = await tcpConnectMs(ip, port, 1500);
      if (ms != null) {
        tcpSamples.push(ms);
      } else {
        break;
      }
    }
    if (!tcpSamples.length) {
      return { ok: false, ms: null, host, port, ip, method: null };
    }
    return {
      ok: true,
      ms: Math.round(median(tcpSamples)),
      host,
      port,
      ip,
      method: "tcp",
      samples: tcpSamples,
    };
  }

  const tcpSamples = [];
  for (let i = 0; i < samples; i += 1) {
    const ms = await tcpConnectMs(ip, port, 1500);
    if (ms != null) {
      tcpSamples.push(ms);
    } else {
      break;
    }
  }

  if (!tcpSamples.length) {
    return { ok: false, ms: null, host, port, ip, method: null };
  }

  const edgeMs = Math.round(median(tcpSamples));
  let ms = edgeMs;
  let method = "tcp";

  // Proxy socat accepts in Germany immediately - TCP connect is only edge RTT.
  // Prefer HTTP through the same proxy hop (full DE->origin path).
  const httpMs = await httpTtfbMs(ip, 50080, 2500);
  if (httpMs != null && httpMs >= edgeMs) {
    ms = httpMs;
    method = "http-path";
  }

  return {
    ok: true,
    ms,
    edgeMs,
    host,
    port,
    ip,
    method,
    samples: tcpSamples,
  };
}

/** If HTTP path probe failed, estimate full proxy RTT from edge + direct. */
function applyProxyPathEstimate(results) {
  const pairs = [
    ["mainProxy", "mainDirect"],
    ["devProxy", "devDirect"],
    ["grimProxy", "grimDirect"],
  ];
  for (const [proxyId, directId] of pairs) {
    const proxy = results[proxyId];
    const direct = results[directId];
    if (!proxy?.ok || proxy.method === "http-path") {
      continue;
    }
    const edge = proxy.edgeMs != null ? proxy.edgeMs : proxy.ms;
    const directMs = direct?.ok ? direct.ms : null;
    const hop = directMs == null ? edge : Math.max(edge, directMs);
    proxy.ms = Math.max(edge + 1, Math.round(edge + hop));
    proxy.method = "proxy-path";
  }
}

function recommendRoute(probes, prefs, directId, proxyId) {
  const direct = probes[directId];
  const proxy = probes[proxyId];
  const lastId = prefs.lastServerId;
  const lastIsPair = lastId === directId || lastId === proxyId;
  const savedId = prefs.lastServerByGame?.[gameIdOf(SERVERS[directId])];
  const savedIsPair = savedId === directId || savedId === proxyId;

  if (prefs.preferredRoute === "proxy" && proxy?.ok) {
    return proxyId;
  }
  if (prefs.preferredRoute === "direct" && direct?.ok) {
    return directId;
  }
  if (lastIsPair && probes[lastId]?.ok) {
    return lastId;
  }
  if (savedIsPair && probes[savedId]?.ok) {
    return savedId;
  }
  if (direct?.ok && proxy?.ok) {
    return direct.ms <= proxy.ms * 1.15 ? directId : proxyId;
  }
  if (direct?.ok) {
    return directId;
  }
  if (proxy?.ok) {
    return proxyId;
  }
  if (lastIsPair) {
    return lastId;
  }
  return directId;
}

function recommendFromProbes(probes, prefs) {
  const byGame = {
    orbitalis: recommendRoute(probes, prefs, "mainDirect", "mainProxy"),
    grimrock: recommendRoute(probes, prefs, "grimDirect", "grimProxy"),
  };
  const lastGame = gameIdOf(SERVERS[prefs.lastServerId]);
  return {
    recommendedId: byGame[lastGame] || byGame.orbitalis,
    recommendedByGame: byGame,
  };
}

function toIntOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function topicStatusToPayload(raw, kind, host, port) {
  if (raw == null) {
    return null;
  }
  if (typeof raw === "number") {
    return {
      ok: true,
      kind,
      host,
      port,
      source: "topic",
      status: {
        players: Math.round(raw),
        playing: Math.round(raw),
        mapName: "-",
        enter: true,
      },
    };
  }
  const text = String(raw).trim();
  if (!text || /commskey|bad key|disabled/i.test(text)) {
    return null;
  }
  const params = parseByondParams(text);
  const players = toIntOrNull(params.players);
  if (players == null && !params.map_name && !params.version) {
    return null;
  }
  const gamestate = toIntOrNull(params.gamestate);
  const roundDur = toIntOrNull(params.round_duration);
  return {
    ok: true,
    kind,
    host,
    port,
    source: "topic",
    status: {
      players: players ?? 0,
      playing: toIntOrNull(params.active_players) ?? players ?? 0,
      mapName: params.map_name || "-",
      roundId: params.round_id || "",
      // Ratwood/TG Topic round_duration is already seconds; renderer expects ds.
      roundDurationSec: roundDur == null ? null : roundDur * 10,
      enter:
        params.enter == null
          ? true
          : params.enter === "1" || params.enter === "true",
      gamestate,
      mode: params.mode || "",
    },
  };
}

async function fetchTopicServerStatus(server, kind) {
  try {
    const looked = await lookupAsync(server.host);
    const ip = looked?.address;
    if (!ip) {
      return { ok: false, kind, error: "dns_failed" };
    }
    const raw = await topicRequest(ip, server.port, "status", 3500);
    const payload = topicStatusToPayload(raw, kind, server.host, server.port);
    if (payload) {
      return payload;
    }
    const playing = await topicRequest(ip, server.port, "playing", 2000);
    const fromPlaying = topicStatusToPayload(
      playing,
      kind,
      server.host,
      server.port
    );
    if (fromPlaying) {
      return fromPlaying;
    }
    const ping = await topicRequest(ip, server.port, "ping", 2000);
    const fromPing = topicStatusToPayload(ping, kind, server.host, server.port);
    if (fromPing) {
      return fromPing;
    }
    const rawText = raw == null ? "" : String(raw);
    let error = "status_unavailable";
    if (/commskey|disabled/i.test(rawText)) {
      error = "topic_locked";
    } else if (/bad key/i.test(rawText)) {
      error = "topic_bad_key";
    }
    return { ok: false, kind, error };
  } catch (error) {
    return {
      ok: false,
      kind,
      error: error?.message ? error.message : String(error),
    };
  }
}

function authStatusMatchesKind(data, kind) {
  if (!data?.ok) {
    return false;
  }
  if (data.kind === kind) {
    return true;
  }
  if (kind === "grim" && Number(data.port) === 41100) {
    return true;
  }
  return false;
}

if (!pendingApplyUpdate) {
  app.whenReady().then(() => {
    cleanupStaleUpdaters();
    registerProtocolClient();
    createWindow();
    discordPresence.start(DISCORD_CLIENT_ID, {
      logPath: path.join(app.getPath("userData"), "discord-rpc.log"),
    });
    gameSession.startWatch((session) => emitGameSession(session));
    try {
      const cachedStatus = readPrefs().lastStatus || {};
      for (const [kind, payload] of Object.entries(cachedStatus)) {
        rememberStatusPayload(kind, payload);
      }
    } catch {
      // ignore
    }
    refreshDiscordPresence();

    const bootUrl = process.argv.find((arg) =>
      String(arg).startsWith(`${PROTOCOL}://`)
    );
    if (bootUrl) {
      handleAuthProtocolUrl(bootUrl);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    gameSession.stopWatch();
    discordPresence.stop();
  });
}

function getReplaceableExePath() {
  // Portable builds run from %TEMP% extract; the real user-facing exe is here.
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  if (portable && typeof portable === "string" && fs.existsSync(portable)) {
    return path.resolve(portable);
  }
  const prefsPath = readPrefs()?.launcherExePath;
  if (prefsPath && fs.existsSync(prefsPath) && !isTempLikePath(prefsPath)) {
    return path.resolve(prefsPath);
  }
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir && fs.existsSync(portableDir)) {
    try {
      const match = fs
        .readdirSync(portableDir)
        .find((name) => /^OrbitalisLauncher.*\.exe$/i.test(name));
      if (match) {
        return path.resolve(portableDir, match);
      }
    } catch {
      // ignore
    }
  }
  return path.resolve(process.execPath);
}

function isTempLikePath(filePath) {
  const normalized = String(filePath || "").toLowerCase().replace(/\//g, "\\");
  return (
    normalized.includes("\\temp\\") ||
    normalized.includes("\\tmp\\") ||
    normalized.includes("\\appdata\\local\\temp\\") ||
    /\\\.tmp\\/i.test(normalized)
  );
}

function canWriteBeside(dirPath) {
  const probe = path.join(dirPath, `.orbitalis-write-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(probe, "1");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveUpdateStagingPath(currentPath, version) {
  const name = `OrbitalisLauncher-${version}.update.exe`;
  const dir = path.dirname(currentPath);
  if (canWriteBeside(dir)) {
    return path.join(dir, name);
  }
  return path.join(app.getPath("temp"), name);
}

function cleanupStaleUpdaters() {
  if (process.platform !== "win32") {
    return;
  }
  const tempDir = app.getPath("temp");
  try {
    for (const entry of fs.readdirSync(tempDir)) {
      if (
        !/^orbitalis-apply-update-.*\.(cmd|ps1|vbs)$/i.test(entry) &&
        !/^orbitalis-update-.*\.log$/i.test(entry) &&
        !/^orbitalis-update-apply-.*\.log$/i.test(entry)
      ) {
        continue;
      }
      const full = path.join(tempDir, entry);
      try {
        const ageMs = Date.now() - fs.statSync(full).mtimeMs;
        if (ageMs > 2 * 60 * 60 * 1000) {
          fs.unlinkSync(full);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Self-update without temp VBS/PowerShell (those look like Trojan.Alien to AV).
 * Spawns the downloaded portable with --orbitalis-apply-update; it waits for
 * this process to exit, replaces the target exe, then relaunches.
 */
function spawnApplyUpdateProcess({ currentPid, currentPath, newPath }) {
  const child = spawn(
    newPath,
    [
      APPLY_UPDATE_FLAG,
      `--orbitalis-update-pid=${Number(currentPid)}`,
      `--orbitalis-update-target=${currentPath}`,
      `--orbitalis-update-source=${newPath}`,
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      cwd: path.dirname(newPath),
    }
  );
  child.unref();
  return child;
}

ipcMain.handle("install-update", async (_event, payload) => {
  const url = payload?.url;
  const version = payload?.version || "next";
  if (!url) {
    return { ok: false, error: "Нет ссылки на обновление" };
  }
  try {
    const safeVersion = String(version).replace(/[^\w.-]+/g, "_");
    const currentPath = getReplaceableExePath();
    const packaged = app.isPackaged;

    if (
      packaged &&
      isTempLikePath(currentPath) &&
      !process.env.PORTABLE_EXECUTABLE_FILE
    ) {
      return {
        ok: false,
        error:
          "Не найден путь к portable exe. Скачай вручную: https://devassets.hornyjail.space/launcher/latest",
      };
    }

    if (!isTempLikePath(currentPath)) {
      writePrefs({ launcherExePath: currentPath });
    }

    const stagingPath = packaged
      ? resolveUpdateStagingPath(currentPath, safeVersion)
      : path.join(app.getPath("temp"), `OrbitalisLauncher-${safeVersion}.exe`);

    const mirrors = launcherMirrorUrls(url);
    let downloaded = false;
    let lastDownloadError = null;
    for (const mirror of mirrors) {
      try {
        await downloadFile(mirror, stagingPath, (progress) => {
          sendToRenderer("update-download-progress", {
            version: safeVersion,
            ...progress,
          });
        });
        downloaded = true;
        break;
      } catch (error) {
        lastDownloadError = error;
        try {
          fs.unlinkSync(stagingPath);
        } catch {
          // ignore
        }
      }
    }
    if (!downloaded) {
      throw lastDownloadError || new Error("download_failed");
    }

    if (!packaged) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Открыть файл", "Позже"],
        defaultId: 0,
        cancelId: 1,
        title: "Обновление скачано",
        message: `Orbitalis ${version} скачан (dev-режим)`,
        detail: stagingPath,
      });
      if (result.response === 0) {
        await shell.openPath(stagingPath);
      }
      return { ok: true, path: stagingPath, replaced: false };
    }

    spawnApplyUpdateProcess({
      currentPid: process.pid,
      currentPath,
      newPath: stagingPath,
    });

    setTimeout(() => app.exit(0), 500);
    return { ok: true, path: currentPath, replaced: true };
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
    };
  }
});

function readByondVersionLabel(byondPath) {
  if (!byondPath) {
    return null;
  }
  try {
    const version = readByondVersion(byondPath);
    if (version && version.major) {
      return `${version.major}.${version.build}`;
    }
    return version?.raw || null;
  } catch {
    return null;
  }
}

ipcMain.handle("get-bootstrap", async () => {
  const byondPath = findByond();
  const prefs = readPrefs();
  const patchStatus = getByondPatchStatus();
  const token = readSessionToken(app.getPath("userData"));
  const cachedUser = prefs.lastAuthUser || null;
  // Token alone means "still logged in" — never flash logout because /me is slow.
  const bootUser = token ? cachedUser || provisionalAuthUser(cachedUser) : null;

  // Never block window paint on auth/DNS — refresh in background.
  if (token && AUTH_CONFIG.authApiUrl) {
    resolveAuthUser()
      .then((real) => {
        if (real.user) {
          sendToRenderer("auth-changed", {
            user: real.user,
            expiresAt: real.expiresAt,
            silent: true,
          });
          return;
        }
        if (real.offline) {
          // Keep session visible; auth API is flaky/timeout-prone on some routes.
          sendToRenderer("auth-changed", {
            user: cachedUser || provisionalAuthUser(cachedUser),
            offline: true,
            silent: true,
          });
          return;
        }
        // Real expiry / invalid session.
        sendToRenderer("auth-changed", { user: null, silent: true });
      })
      .catch(() => {
        sendToRenderer("auth-changed", {
          user: cachedUser || provisionalAuthUser(cachedUser),
          offline: true,
          silent: true,
        });
      });
  }

  return {
    servers: SERVERS,
    links: LINKS,
    prefs,
    byondInstalled: Boolean(byondPath),
    byondPath,
    byondVersion: readByondVersionLabel(byondPath),
    byondPatched: Boolean(patchStatus.patched),
    launcherVersion: app.getVersion(),
    auth: {
      configured: Boolean(AUTH_CONFIG.authApiUrl),
      apiUrl: AUTH_CONFIG.authApiUrl || null,
      user: bootUser,
      offline: false,
      pending: Boolean(token),
    },
    logs: {
      configured: Boolean(LOGS_CONFIG.logsApiUrl),
      apiUrl: LOGS_CONFIG.logsApiUrl || null,
    },
    music: {
      configured: Boolean(MUSIC_CONFIG.musicApiUrl),
      apiUrl: MUSIC_CONFIG.musicApiUrl || null,
    },
    lastProbes: prefs.lastProbes || null,
    lastStatus: prefs.lastStatus || null,
    gameSession: gameSession.getSession(),
  };
});

ipcMain.handle("pick-byond", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Укажи dreamseeker.exe или папку BYOND",
    buttonLabel: "Выбрать",
    properties: ["openFile", "openDirectory"],
    filters: [
      { name: "BYOND", extensions: ["exe"] },
      { name: "Все файлы", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, cancelled: true };
  }
  const resolved = resolveByondExe(result.filePaths[0]);
  if (!resolved) {
    return {
      ok: false,
      error:
        "Не нашёл dreamseeker.exe / byond.exe. Выбери файл из папки BYOND\\bin.",
    };
  }
  writePrefs({ byondPath: resolved });
  return {
    ok: true,
    byondPath: resolved,
    byondVersion: readByondVersionLabel(resolved),
  };
});

ipcMain.handle("clear-byond-path", async () => {
  writePrefs({ byondPath: null });
  const byondPath = findByond();
  return {
    ok: true,
    byondPath,
    byondInstalled: Boolean(byondPath),
    byondVersion: readByondVersionLabel(byondPath),
  };
});

function resolveDreamseekerForPatch() {
  const found = findByond();
  if (!found) {
    return null;
  }
  const base = path.basename(found).toLowerCase();
  if (base === "dreamseeker.exe") {
    return found;
  }
  const sibling = path.join(path.dirname(found), "dreamseeker.exe");
  if (fs.existsSync(sibling)) {
    return sibling;
  }
  return found;
}

function getByondPatchStatus() {
  const dreamseeker = resolveDreamseekerForPatch();
  if (!dreamseeker) {
    return { ok: false, patched: false, byondPath: null };
  }
  const version = readByondVersion(dreamseeker);
  const patched = isByondNoAdPatched(dreamseeker);
  return {
    ok: true,
    patched,
    byondPath: dreamseeker,
    byondVersion: version.raw,
    byondMajor: version.major,
  };
}

function isProtectedByondPath(exePath) {
  const normalized = String(exePath || "").toLowerCase();
  const pf = String(process.env.ProgramFiles || "c:\\program files").toLowerCase();
  const pf86 = String(
    process.env["ProgramFiles(x86)"] || "c:\\program files (x86)"
  ).toLowerCase();
  return normalized.startsWith(pf) || normalized.startsWith(pf86);
}

function canWriteFile(filePath) {
  try {
    const fd = fs.openSync(filePath, "r+");
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function copyFilesElevated(filePairs) {
  return new Promise((resolve, reject) => {
    const stamp = Date.now();
    const scriptPath = path.join(
      app.getPath("temp"),
      `orbitalis-byond-copy-${stamp}.cmd`
    );
    const lines = ["@echo off"];
    for (const pair of filePairs) {
      const bak = `${pair.dest}.bak`;
      lines.push(
        `if not exist "${bak.replace(/"/g, '""')}" copy /Y "${pair.dest.replace(/"/g, '""')}" "${bak.replace(/"/g, '""')}" >nul`
      );
      lines.push(
        `copy /Y "${pair.src.replace(/"/g, '""')}" "${pair.dest.replace(/"/g, '""')}" >nul`
      );
      lines.push("if errorlevel 1 exit /b 1");
    }
    lines.push("exit /b 0");
    lines.push("");
    fs.writeFileSync(scriptPath, lines.join("\r\n"), "utf8");

    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath ${JSON.stringify(scriptPath)} -Verb RunAs -Wait`,
      ],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }
    );

    let stderr = "";
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", (error) => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // ignore
      }
      reject(error);
    });

    child.on("exit", (code) => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // ignore
      }
      if (code && code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              "UAC отклонён или не удалось скопировать файлы с правами администратора."
          )
        );
        return;
      }
      resolve({ elevated: true });
    });
  });
}

async function applyByondAdPatchToFile(dreamseeker) {
  const built = buildPatchedBuffers(dreamseeker);
  if (!built.ok && !built.alreadyPatched) {
    return {
      patched: false,
      error: built.error || "Не удалось подготовить патч",
      version: built.version,
      details: built.details,
    };
  }
  if (built.alreadyPatched || !built.files?.length) {
    return {
      patched: isByondNoAdPatched(dreamseeker),
      alreadyPatched: true,
      version: built.version,
      details: built.details,
      changed: 0,
    };
  }

  const needsElevation =
    built.files.some(
      (file) => isProtectedByondPath(file.path) || !canWriteFile(file.path)
    );

  if (!needsElevation) {
    writePatchedFiles(built.files);
  } else {
    const tempDir = path.join(app.getPath("temp"), `orbitalis-byond-patch-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const pairs = [];
    try {
      for (const file of built.files) {
        const tmp = path.join(tempDir, path.basename(file.path));
        fs.writeFileSync(tmp, file.buffer);
        pairs.push({ src: tmp, dest: file.path });
      }
      await copyFilesElevated(pairs);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  const patched = isByondNoAdPatched(dreamseeker);
  return {
    patched,
    elevated: needsElevation,
    changed: built.changed || built.files.length,
    version: built.version,
    details: built.details,
    target: getPatchTarget(dreamseeker),
  };
}

function listRunningByondProcesses() {
  if (process.platform !== "win32") {
    return [];
  }
  const names = ["dreamseeker.exe", "byond.exe", "byondwin.exe"];
  const found = [];
  for (const name of names) {
    try {
      const raw = require("child_process")
        .execFileSync(
          "tasklist",
          ["/FI", `IMAGENAME eq ${name}`, "/FO", "CSV", "/NH"],
          { encoding: "utf8", windowsHide: true, timeout: 5000 }
        )
        .toString();
      if (/dreamseeker\.exe|byond\.exe|byondwin\.exe/i.test(raw)) {
        found.push(name);
      }
    } catch {
      // not running / tasklist failed
    }
  }
  return [...new Set(found)];
}

function closeRunningByondProcesses() {
  const running = listRunningByondProcesses();
  for (const name of running) {
    try {
      require("child_process").execFileSync(
        "taskkill",
        ["/F", "/IM", name],
        { encoding: "utf8", windowsHide: true, timeout: 8000 }
      );
    } catch {
      // may already have exited
    }
  }
  // Give Windows a moment to release file locks on dreamseeker.exe
  const { execFileSync } = require("child_process");
  try {
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "Start-Sleep -Milliseconds 800"],
      { windowsHide: true, timeout: 5000 }
    );
  } catch {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
  }
  return listRunningByondProcesses();
}

ipcMain.handle("get-byond-patch-status", async () => getByondPatchStatus());

ipcMain.handle("patch-byond-ads", async (_event, options = {}) => {
  try {
    const closeByond = Boolean(options.closeByond);
    const dreamseeker = resolveDreamseekerForPatch();
    if (!dreamseeker) {
      return {
        ok: false,
        needByond: true,
        error: "BYOND не найден. Укажи dreamseeker.exe.",
      };
    }

    if (isByondNoAdPatched(dreamseeker)) {
      return {
        ok: true,
        alreadyPatched: true,
        message: "No-ad patch уже стоит",
        byondPath: dreamseeker,
        patched: true,
        byondVersion: readByondVersion(dreamseeker).raw,
      };
    }

    const running = listRunningByondProcesses();
    if (running.length && !closeByond) {
      return {
        ok: false,
        needCloseByond: true,
        processes: running,
        error: `BYOND запущен (${running.join(", ")}). Закрой клиент перед патчем.`,
      };
    }

    if (running.length && closeByond) {
      const still = closeRunningByondProcesses();
      if (still.length) {
        return {
          ok: false,
          needCloseByond: true,
          processes: still,
          error: `Не удалось закрыть: ${still.join(", ")}. Закрой BYOND вручную.`,
        };
      }
    }

    const target = getPatchTarget(dreamseeker);
    const writeTargets =
      target.version.major >= 516
        ? [target.corePath]
        : [dreamseeker];
    const needsElevation = writeTargets.some(
      (filePath) =>
        isProtectedByondPath(filePath) ||
        (fs.existsSync(filePath) && !canWriteFile(filePath))
    );
    if (needsElevation && !options.allowElevation) {
      return {
        ok: false,
        needElevation: true,
        byondPath: dreamseeker,
        error:
          "BYOND стоит в защищённой папке (Program Files). Нужно подтвердить UAC.",
      };
    }

    const applied = await applyByondAdPatchToFile(dreamseeker);
    if (applied.error && !applied.alreadyPatched) {
      return {
        ok: false,
        byondPath: dreamseeker,
        elevated: applied.elevated,
        error: applied.error,
        details: applied.details,
        byondVersion: applied.version?.raw,
      };
    }
    if (!applied.patched) {
      const hint =
        applied.changed === 0
          ? "Не удалось убрать таймер гостя - версия BYOND может отличаться от поддерживаемой."
          : needsElevation
            ? "Не удалось записать файлы BYOND даже с правами администратора."
            : "Патч отработал, но проверка не прошла. Закрой BYOND и попробуй снова.";
      return {
        ok: false,
        byondPath: dreamseeker,
        changed: applied.changed,
        elevated: applied.elevated,
        error: hint,
        details: applied.details,
        byondVersion: applied.version?.raw,
      };
    }

    return {
      ok: true,
      message: applied.elevated
        ? "No-ad patch применён (с правами администратора)"
        : "No-ad patch применён",
      byondPath: dreamseeker,
      patched: true,
      changed: applied.changed,
      elevated: applied.elevated,
      byondVersion: applied.version?.raw,
      target: applied.target,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
    };
  }
});

async function buildConnectionDiagReport() {
  const lines = [];
  const stamp = new Date().toISOString();
  lines.push("Orbitalis connection diagnostics");
  lines.push(`generated: ${stamp}`);
  lines.push(`launcher: ${app.getVersion()}`);
  lines.push(
    `runtime: electron ${process.versions.electron} / node ${process.versions.node}`
  );
  lines.push(`os: ${os.type()} ${os.release()} ${os.arch()}`);
  lines.push(`cwd: ${process.cwd()}`);
  lines.push(`execPath: ${getReplaceableExePath()}`);
  lines.push("");

  const byond = getByondPatchStatus();
  lines.push(
    `byond: ${byond.byondPath || "not found"} | version=${
      byond.byondVersion || "?"
    } | no-ad-patch=${byond.patched ? "yes" : "no"}`
  );
  lines.push("");

  const hosts = [
    ...new Set(Object.values(SERVERS).map((s) => s.host)),
    "auth.hornyjail.space",
    "devassets.hornyjail.space",
  ];
  lines.push("=== DNS ===");
  for (const host of hosts) {
    try {
      const looked = await dnsLookup(host, { all: true });
      const list = Array.isArray(looked) ? looked : [looked];
      lines.push(
        `${host} -> ${list
          .map((row) => `${row.address} (v${row.family})`)
          .join(", ")}`
      );
    } catch (error) {
      lines.push(`${host} -> FAIL (${error?.message || error})`);
    }
  }
  lines.push("");

  lines.push("=== BYOND routes (TCP + Topic where applicable) ===");
  const probes = {};
  for (const [id, server] of Object.entries(SERVERS)) {
    const probe = await probeServer(server, 3);
    probes[id] = probe;
    lines.push(
      `[${id}] ${server.label} ${server.host}:${server.port} route=${server.route}`
    );
    lines.push(
      `  ip=${probe.ip || "-"} ok=${probe.ok} method=${probe.method || "-"} ms=${
        probe.ms ?? "-"
      }${probe.edgeMs != null ? ` edgeMs=${probe.edgeMs}` : ""}`
    );
    if (Array.isArray(probe.samples) && probe.samples.length) {
      lines.push(`  samples=${probe.samples.join(", ")}`);
    }
  }
  applyProxyPathEstimate(probes);
  lines.push("");
  lines.push("=== After proxy-path estimate ===");
  for (const [id, probe] of Object.entries(probes)) {
    lines.push(
      `[${id}] ok=${probe.ok} method=${probe.method || "-"} ms=${probe.ms ?? "-"}`
    );
  }
  lines.push("");

  lines.push("=== HTTP checks ===");
  const httpTargets = [
    { name: "auth", url: "https://auth.hornyjail.space/" },
    {
      name: "cdn-version",
      url: "https://devassets.hornyjail.space/launcher/version.json",
    },
    { name: "proxy-http", url: "http://proxy.hornyjail.space:50080/" },
  ];
  for (const target of httpTargets) {
    const started = process.hrtime.bigint();
    try {
      await new Promise((resolve, reject) => {
        const parsed = new URL(target.url);
        const lib = parsed.protocol === "http:" ? http : https;
        const req = lib.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
            path: `${parsed.pathname}${parsed.search}`,
            method: "GET",
            timeout: 8000,
            headers: { "User-Agent": `OrbitalisLauncher/${app.getVersion()}` },
          },
          (res) => {
            res.resume();
            const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
            lines.push(
              `${target.name}: HTTP ${res.statusCode} in ${ms}ms (${target.url})`
            );
            resolve();
          }
        );
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("timeout"));
        });
        req.on("error", reject);
        req.end();
      });
    } catch (error) {
      const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
      lines.push(
        `${target.name}: FAIL in ${ms}ms (${error?.message || error})`
      );
    }
  }

  lines.push("");
  lines.push("=== Summary ===");
  const mainDirect = probes.mainDirect;
  const mainProxy = probes.mainProxy;
  if (mainDirect?.ok && mainProxy?.ok) {
    lines.push("main: both direct and proxy reachable");
  } else if (mainDirect?.ok) {
    lines.push("main: direct OK, proxy FAIL - use direct or check DE proxy");
  } else if (mainProxy?.ok) {
    lines.push("main: proxy OK, direct FAIL - use proxy route");
  } else {
    lines.push("main: both routes FAIL - network/firewall or server down");
  }

  const grimDirect = probes.grimDirect;
  const grimProxy = probes.grimProxy;
  if (grimDirect?.ok && grimProxy?.ok) {
    lines.push("grimrock: both direct and proxy reachable");
  } else if (grimDirect?.ok) {
    lines.push("grimrock: direct OK, proxy FAIL - check DE ss13-proxy-grim :41100");
  } else if (grimProxy?.ok) {
    lines.push("grimrock: proxy OK, direct FAIL - use proxy route");
  } else {
    lines.push("grimrock: both routes FAIL - network/firewall or server down");
  }

  return {
    ok: true,
    generatedAt: stamp,
    report: `${lines.join("\n")}\n`,
    probes,
  };
}

ipcMain.handle("run-connection-diag", async () => {
  try {
    return await buildConnectionDiagReport();
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
    };
  }
});

ipcMain.handle("save-diag-report", async (_event, reportText) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Сохранить диагностику",
    defaultPath: `orbitalis-diag-${stamp}.txt`,
    filters: [
      { name: "Текст", extensions: ["txt"] },
      { name: "Все файлы", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true };
  }
  fs.writeFileSync(result.filePath, String(reportText || ""), "utf8");
  return { ok: true, path: result.filePath };
});

ipcMain.handle("probe-servers", async () => {
  const ids = Object.keys(SERVERS);
  const results = {};
  await Promise.all(
    ids.map(async (id) => {
      results[id] = await probeServer(SERVERS[id]);
    })
  );
  applyProxyPathEstimate(results);
  const prefs = readPrefs();
  const compact = {};
  for (const [id, probe] of Object.entries(results)) {
    compact[id] = {
      ok: Boolean(probe?.ok),
      ms: probe?.ms ?? null,
      method: probe?.method || null,
    };
  }
  writePrefs({ lastProbes: compact });
  const rec = recommendFromProbes(results, prefs);
  return {
    probes: results,
    recommendedId: rec.recommendedId,
    recommendedByGame: rec.recommendedByGame,
  };
});

ipcMain.handle("fetch-news", async () => {
  try {
    const feeds = await getNewsFeeds();
    return { ok: true, feeds };
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
      feeds: {},
    };
  }
});

ipcMain.handle("save-prefs", (_event, patch) => writePrefs(patch || {}));

ipcMain.handle("connect", async (_event, serverId) => {
  const server = SERVERS[serverId];
  if (!server) {
    return { ok: false, error: "Unknown server" };
  }
  if (launchInFlight) {
    return { ok: false, error: "Запуск уже идёт" };
  }

  const live = await gameSession.poll();
  if (live.running || live.launching) {
    gameSession.rememberTarget({
      serverId,
      game: gameIdOf(server),
      label: server.label,
    });
    let focused = { ok: false };
    if (live.running) {
      focused = await gameSession.focusDreamseeker();
    }
    emitGameSession();
    return {
      ok: true,
      alreadyRunning: true,
      launching: Boolean(live.launching && !live.running),
      focused: Boolean(focused?.ok),
      url: server.url,
      label: server.label,
      id: serverId,
      session: gameSession.getSession(),
    };
  }

  launchInFlight = true;
  try {
    const result = await launchByondUrl(server.url);
    writePrefs({
      lastServerId: serverId,
      lastServerByGame: {
        ...(readPrefs().lastServerByGame || {}),
        [gameIdOf(server)]: serverId,
      },
      preferredRoute: server.route,
      lastConnectedAt: Date.now(),
    });
    if (result.ok) {
      gameSession.markLaunched({
        serverId,
        game: gameIdOf(server),
        label: server.label,
      });
      emitGameSession();
    }
    return {
      ...result,
      url: server.url,
      label: server.label,
      id: serverId,
      session: gameSession.getSession(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
      url: server.url,
    };
  } finally {
    launchInFlight = false;
  }
});

ipcMain.handle("get-game-session", async () => gameSession.getSession());

ipcMain.handle("focus-game", async () => {
  const live = await gameSession.poll();
  if (!live.running) {
    return { ok: false, running: false, error: "Игра не запущена" };
  }
  const focused = await gameSession.focusDreamseeker();
  emitGameSession();
  return { ok: Boolean(focused?.ok), running: true, ...focused, session: live };
});

ipcMain.handle("presence-context", async (_event, payload) => {
  const game = payload?.game === "grimrock" ? "grimrock" : "orbitalis";
  const view = payload?.view === "home" ? "home" : "worlds";
  presenceContext = { game, view };
  refreshDiscordPresence();
  return { ok: true };
});

ipcMain.handle("open-external", async (_event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

function toDiscordDeepLink(url) {
  const match = String(url || "").match(
    /discord(?:app)?\.com\/channels\/([^/?#]+)\/(\d+)(?:\/(\d+))?/i
  );
  if (!match) {
    return null;
  }
  const [, guild, channel, message] = match;
  if (message) {
    return `discord://-/channels/${guild}/${channel}/${message}`;
  }
  return `discord://-/channels/${guild}/${channel}`;
}

ipcMain.handle("open-discord", async (_event, url) => {
  const deep = toDiscordDeepLink(url);
  if (deep) {
    try {
      await shell.openExternal(deep);
      return { ok: true, method: "discord" };
    } catch {
      // fall through to https
    }
  }
  await shell.openExternal(url);
  return { ok: true, method: "https" };
});

const UPDATE_MANIFEST_URLS = [
  // DE edge cache first (faster / more stable for many players).
  "http://proxy.hornyjail.space:50080/launcher/version.json",
  "https://devassets.hornyjail.space/launcher/version.json",
];

function launcherMirrorUrls(primaryUrl) {
  const urls = [];
  const push = (u) => {
    if (u && !urls.includes(u)) urls.push(u);
  };
  push(primaryUrl);
  try {
    const parsed = new URL(String(primaryUrl || ""));
    const name = path.posix.basename(parsed.pathname);
    if (name) {
      push(`http://proxy.hornyjail.space:50080/launcher/${name}`);
      push(`https://devassets.hornyjail.space/launcher/${name}`);
    }
  } catch {
    // ignore
  }
  // Prefer DE mirror first when primary was UA HTTPS.
  urls.sort((a, b) => {
    const score = (u) =>
      String(u).includes("proxy.hornyjail.space") ? 0 : 1;
    return score(a) - score(b);
  });
  return urls;
}

function parseVersionParts(version) {
  return String(version || "0")
    .replace(/^v/i, "")
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((part) => Number(part) || 0);
}

function isRemoteNewer(remote, local) {
  const a = parseVersionParts(remote);
  const b = parseVersionParts(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

function fetchUrlJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        family: 4,
        lookup: lookupIpv4First,
        headers: {
          Accept: "application/json",
          "User-Agent": `OrbitalisLauncher/${app.getVersion()}`,
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchUrlJson(new URL(res.headers.location, url).toString(), timeoutMs)
            .then(resolve)
            .catch(reject);
          return;
        }
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "http:" ? http : https;
    const file = fs.createWriteStream(destPath);
    const req = lib.get(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        family: 4,
        lookup: lookupIpv4First,
        headers: { "User-Agent": `OrbitalisLauncher/${app.getVersion()}` },
        timeout: 120000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(destPath, () => {
            downloadFile(
              new URL(res.headers.location, url).toString(),
              destPath,
              onProgress
            )
              .then(resolve)
              .catch(reject);
          });
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          file.close();
          fs.unlink(destPath, () => {});
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers["content-length"]) || 0;
        let received = 0;
        let lastPct = -1;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (!onProgress) {
            return;
          }
          const percent = total
            ? Math.min(100, Math.round((received / total) * 100))
            : 0;
          if (percent === lastPct && total) {
            return;
          }
          lastPct = percent;
          onProgress({ received, total, percent });
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            if (onProgress) {
              onProgress({
                received: total || received,
                total: total || received,
                percent: 100,
              });
            }
            resolve(destPath);
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(error);
    });
  });
}

async function loadUpdateManifest() {
  for (const url of UPDATE_MANIFEST_URLS) {
    try {
      const manifest = await fetchUrlJson(url);
      if (manifest?.version && manifest?.url) {
        return { ...manifest, source: url };
      }
    } catch {
      // try next
    }
  }
  return null;
}

ipcMain.handle("check-update", async () => {
  const current = app.getVersion();
  try {
    const manifest = await loadUpdateManifest();
    if (!manifest) {
      return { ok: true, current, update: null };
    }
    if (!isRemoteNewer(manifest.version, current)) {
      return { ok: true, current, update: null };
    }
    return {
      ok: true,
      current,
      update: {
        version: String(manifest.version),
        url: String(manifest.url),
        notes: manifest.notes ? String(manifest.notes) : "",
      },
    };
  } catch (error) {
    return {
      ok: false,
      current,
      error: error?.message ? error.message : String(error),
    };
  }
});

ipcMain.handle("auth-login", async () => {
  if (!AUTH_CONFIG.authApiUrl) {
    return { ok: false, error: "Auth API URL не настроен" };
  }
  try {
    const started = await startDiscordLogin(AUTH_CONFIG.authApiUrl);
    if (!started?.authorizeUrl) {
      return { ok: false, error: "Сервер входа не вернул ссылку Discord" };
    }
    await shell.openExternal(started.authorizeUrl);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
    };
  }
});

ipcMain.handle("auth-logout", async () => {
  const token = readSessionToken(app.getPath("userData"));
  if (token && AUTH_CONFIG.authApiUrl) {
    await logoutRemote(AUTH_CONFIG.authApiUrl, token);
  }
  clearSessionToken(app.getPath("userData"));
  cacheAuthUser(null);
  sendToRenderer("auth-changed", { user: null });
  return { ok: true };
});

ipcMain.handle("auth-refresh", async () => resolveAuthUser());

ipcMain.handle("fetch-status", async (_event, kind) => {
  const safeKind =
    kind === "dev" ? "dev" : kind === "grim" ? "grim" : "main";

  let payload;
  if (safeKind === "grim") {
    const topic = await fetchTopicServerStatus(SERVERS.grimDirect, "grim");
    if (topic?.ok) {
      payload = topic;
    } else if (AUTH_CONFIG.authApiUrl) {
      try {
        const data = await fetchServerStatus(AUTH_CONFIG.authApiUrl, "grim");
        if (authStatusMatchesKind(data, "grim")) {
          payload = { ...data, kind: "grim" };
        }
      } catch {
        // Topic is the source of truth for Grimrock until auth learns this instance.
      }
    }
    if (!payload) {
      payload = topic;
    }
  } else if (AUTH_CONFIG.authApiUrl) {
    try {
      payload = await fetchServerStatus(AUTH_CONFIG.authApiUrl, safeKind);
    } catch (error) {
      payload = {
        ok: false,
        kind: safeKind,
        error: error?.message ? error.message : String(error),
      };
    }
  } else {
    payload = { ok: false, error: "Auth API URL не настроен" };
  }

  rememberStatusPayload(safeKind, payload);
  refreshDiscordPresence();
  return payload;
});

ipcMain.handle("fetch-player", async (_event, kind) => {
  if (!AUTH_CONFIG.authApiUrl) {
    return { ok: false, error: "Auth API URL не настроен" };
  }
  const token = readSessionToken(app.getPath("userData"));
  if (!token) {
    return { ok: false, error: "unauthorized" };
  }
  try {
    const result = await fetchPlayerCard(AUTH_CONFIG.authApiUrl, token, kind);
    if (result.expired) {
      clearSessionToken(app.getPath("userData"));
      sendToRenderer("auth-changed", { user: null, error: "session_expired" });
      return { ok: false, error: "session_expired" };
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
    };
  }
});

async function withLogsAuth(handler) {
  if (!LOGS_CONFIG.logsApiUrl) {
    return { ok: false, error: "Logs API URL не настроен" };
  }
  const token = readSessionToken(app.getPath("userData"));
  if (!token) {
    return { ok: false, error: "unauthorized" };
  }
  try {
    const result = await handler(LOGS_CONFIG.logsApiUrl, token);
    if (result?.expired) {
      clearSessionToken(app.getPath("userData"));
      sendToRenderer("auth-changed", { user: null, error: "session_expired" });
      return { ok: false, error: "session_expired" };
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
    };
  }
}

ipcMain.handle("logs-me", async () => withLogsAuth(logsMe));

ipcMain.handle("logs-tree", async (_event, query) =>
  withLogsAuth((url, token) => logsTree(url, token, query || {}))
);

ipcMain.handle("logs-round", async (_event, query) => {
  if (!query?.year || !query?.month || !query?.day || !query?.round) {
    return { ok: false, error: "year, month, day, round required" };
  }
  return withLogsAuth((url, token) => logsRound(url, token, query));
});

ipcMain.handle("logs-generate", async (_event, files) => {
  if (!Array.isArray(files) || !files.length) {
    return { ok: false, error: "No files selected" };
  }
  return withLogsAuth((url, token) => logsGenerate(url, token, files));
});

ipcMain.handle("logs-view", async (_event, payload) => {
  if (!payload?.jobId) {
    return { ok: false, error: "jobId required" };
  }
  return withLogsAuth((url, token) =>
    logsView(url, token, payload.jobId, payload.page || 1, {
      all: Boolean(payload.all),
    })
  );
});

async function withMusicAuth(handler) {
  if (!MUSIC_CONFIG.musicApiUrl) {
    return { ok: false, error: "Music API URL не настроен" };
  }
  const token = readSessionToken(app.getPath("userData"));
  if (!token) {
    return { ok: false, error: "unauthorized" };
  }
  try {
    const result = await handler(MUSIC_CONFIG.musicApiUrl, token);
    if (result?.expired) {
      clearSessionToken(app.getPath("userData"));
      sendToRenderer("auth-changed", { user: null, error: "session_expired" });
      return { ok: false, error: "session_expired" };
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? error.message : String(error),
    };
  }
}

ipcMain.handle("music-me", async () => withMusicAuth(musicMe));

ipcMain.handle("music-library", async (_event, payload) =>
  withMusicAuth((url, token) =>
    musicLibrary(url, token, payload?.kind || "mine", payload?.q || "")
  )
);

ipcMain.handle("music-playlist-get", async () =>
  withMusicAuth(musicPlaylistGet)
);

ipcMain.handle("music-playlist-put", async (_event, trackIds) => {
  if (!Array.isArray(trackIds)) {
    return { ok: false, error: "trackIds required" };
  }
  return withMusicAuth((url, token) => musicPlaylistPut(url, token, trackIds));
});

ipcMain.handle("music-delete", async (_event, trackId) => {
  if (!trackId) return { ok: false, error: "trackId required" };
  return withMusicAuth((url, token) => musicDeleteTrack(url, token, trackId));
});

ipcMain.handle("music-patch", async (_event, payload) => {
  if (!payload?.trackId) return { ok: false, error: "trackId required" };
  return withMusicAuth((url, token) =>
    musicPatchTrack(url, token, payload.trackId, payload.patch || {})
  );
});

ipcMain.handle("music-pick-and-upload", async (_event, meta = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Выбери аудиофайл",
    buttonLabel: "Загрузить",
    properties: ["openFile"],
    filters: [
      { name: "Audio", extensions: ["mp3", "ogg", "wav", "flac", "m4a", "aac"] },
      { name: "Все файлы", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, cancelled: true };
  }
  const filePath = result.filePaths[0];
  return withMusicAuth((url, token) =>
    musicUpload(url, token, {
      filePath,
      fileName: path.basename(filePath),
      trackName: meta.trackName || path.basename(filePath, path.extname(filePath)),
      trackAuthor: meta.trackAuthor || "Unknown artist",
      visibility: meta.visibility || "public",
    })
  );
});

ipcMain.handle("music-import-url", async (_event, payload = {}) => {
  const sourceUrl = String(payload.url || "").trim();
  if (!sourceUrl) return { ok: false, error: "url_required" };
  return withMusicAuth((url, token) =>
    musicImportUrl(url, token, {
      url: sourceUrl,
      trackName: payload.trackName,
      trackAuthor: payload.trackAuthor,
      visibility: payload.visibility || "public",
    })
  );
});

ipcMain.handle("music-local-stream", async (_event, trackId) => {
  if (!trackId) return { ok: false, error: "trackId required" };
  return withMusicAuth((url, token) => musicDownloadToTemp(url, token, trackId));
});
