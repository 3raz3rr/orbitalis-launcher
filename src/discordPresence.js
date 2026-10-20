const net = require("net");
const fs = require("fs");

const OP = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4,
};

const RECONNECT_MS = 8000;
const MAX_TEXT = 120;

let clientId = "";
let socket = null;
let ready = false;
let connecting = false;
let reconnectTimer = null;
let nonceSeq = 0;
let lastActivityJson = "";
let currentActivity = null;
let logPath = "";
let degradeStep = 0;

function clip(value, fallback = "") {
  const text = String(value || fallback).replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

function unixSec(ms) {
  const n = Number(ms) || Date.now();
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function log(message, extra) {
  if (!logPath) {
    return;
  }
  try {
    const line = extra
      ? `${new Date().toISOString()} ${message} ${JSON.stringify(extra)}\n`
      : `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    // ignore
  }
}

function encode(op, obj) {
  const data = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0);
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data]);
}

function nextNonce() {
  nonceSeq += 1;
  return `${Date.now()}-${nonceSeq}`;
}

function pipeNames() {
  const names = [];
  for (let i = 0; i < 10; i += 1) {
    names.push(`\\\\.\\pipe\\discord-ipc-${i}`);
  }
  return names;
}

function compact(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item == null || item === "") {
      continue;
    }
    if (typeof item === "object" && !Array.isArray(item)) {
      const inner = compact(item);
      if (inner && Object.keys(inner).length) {
        out[key] = inner;
      }
    } else {
      out[key] = item;
    }
  }
  return out;
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
  if (typeof reconnectTimer.unref === "function") {
    reconnectTimer.unref();
  }
}

function teardown(reconnect = true) {
  ready = false;
  connecting = false;
  lastActivityJson = "";
  const current = socket;
  socket = null;
  if (current) {
    try {
      current.removeAllListeners();
      current.destroy();
    } catch {
      // ignore
    }
  }
  if (reconnect) {
    scheduleReconnect();
  }
}

function send(op, obj) {
  if (!socket || socket.destroyed) {
    return false;
  }
  try {
    socket.write(encode(op, obj));
    return true;
  } catch (error) {
    log("send_fail", { error: String(error?.message || error) });
    teardown();
    return false;
  }
}

function activityPayload(activity) {
  if (!activity || activity.clear) {
    return null;
  }
  const raw = {
    type: 0,
    details: activity.details,
    state: activity.state,
    timestamps: activity.timestamps,
    assets: activity.assets,
    buttons: activity.buttons,
  };
  if (degradeStep >= 1) {
    raw.buttons = undefined;
  }
  if (degradeStep >= 2) {
    raw.assets = undefined;
  }
  if (degradeStep >= 3) {
    raw.timestamps = undefined;
  }
  if (degradeStep >= 4) {
    raw.state = undefined;
  }
  return compact(raw);
}

function sendActivity(activity) {
  if (!ready) {
    return;
  }
  // Always bind RPC to the launcher process. Discord keeps one activity per
  // application+pid; using dreamseeker.exe pid leaves the launcher card stuck
  // on "В лаунчере" and the in-game payload never shows.
  const payload = {
    cmd: "SET_ACTIVITY",
    nonce: nextNonce(),
    args: {
      pid: process.pid,
      activity: activityPayload(activity),
    },
  };
  log("set_activity", {
    degradeStep,
    pid: payload.args.pid,
    activity: payload.args.activity,
  });
  send(OP.FRAME, payload);
}

function handleFrame(payload) {
  let msg;
  try {
    msg = JSON.parse(payload.toString("utf8"));
  } catch {
    return;
  }
  if (msg?.evt === "READY") {
    ready = true;
    degradeStep = 0;
    lastActivityJson = "";
    log("ready", { user: msg?.data?.user?.username || null });
    if (currentActivity) {
      sendActivity(currentActivity);
      lastActivityJson = JSON.stringify(currentActivity);
    }
    return;
  }
  if (msg?.evt === "ERROR") {
    log("error", msg?.data || msg);
    if (!currentActivity || currentActivity.clear || degradeStep >= 4) {
      return;
    }
    degradeStep += 1;
    lastActivityJson = "";
    sendActivity(currentActivity);
  }
}

function attach(sock) {
  let buf = Buffer.alloc(0);
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const op = buf.readUInt32LE(0);
      const len = buf.readUInt32LE(4);
      if (len > 1024 * 1024) {
        teardown();
        return;
      }
      if (buf.length < 8 + len) {
        break;
      }
      const body = buf.slice(8, 8 + len);
      buf = buf.slice(8 + len);
      if (op === OP.PING) {
        let decoded = {};
        try {
          decoded = JSON.parse(body.toString("utf8") || "{}");
        } catch {
          decoded = {};
        }
        send(OP.PONG, decoded);
      } else if (op === OP.FRAME) {
        handleFrame(body);
      } else if (op === OP.CLOSE) {
        log("ipc_close");
        teardown();
      }
    }
  });
  sock.on("error", (error) => {
    log("socket_error", { error: String(error?.message || error) });
    teardown();
  });
  sock.on("close", () => teardown());
  sock.on("end", () => teardown());
}

function tryPipe(name) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ path: name });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      resolve(null);
    }, 400);
    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      sock.removeListener("connect", onConnect);
      sock.removeListener("error", onError);
      resolve(ok ? sock : null);
    };
    const onConnect = () => finish(true);
    const onError = () => {
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      finish(false);
    };
    sock.once("connect", onConnect);
    sock.once("error", onError);
  });
}

async function connect() {
  if (!clientId || socket || connecting) {
    return;
  }
  connecting = true;
  try {
    for (const name of pipeNames()) {
      const sock = await tryPipe(name);
      if (!sock) {
        continue;
      }
      socket = sock;
      connecting = false;
      attach(sock);
      log("handshake", { pipe: name, clientId });
      send(OP.HANDSHAKE, { v: 1, client_id: String(clientId) });
      return;
    }
  } finally {
    connecting = false;
  }
  log("no_discord_ipc");
  scheduleReconnect();
}

function setActivity(activity) {
  const next = activity ? { ...activity, pid: process.pid } : activity;
  currentActivity = next;
  degradeStep = 0;
  const encoded = JSON.stringify(next || null);
  if (encoded === lastActivityJson && ready) {
    return;
  }
  lastActivityJson = encoded;
  if (!ready) {
    connect();
    return;
  }
  sendActivity(next);
}

function clearActivity() {
  setActivity({ clear: true, pid: process.pid });
}

function start(id, options = {}) {
  clientId = String(id || "").trim();
  logPath = options.logPath ? String(options.logPath) : "";
  if (logPath) {
    try {
      fs.writeFileSync(logPath, `${new Date().toISOString()} start\n`, "utf8");
    } catch {
      logPath = "";
    }
  }
  if (!clientId) {
    return;
  }
  connect();
}

function stop() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  currentActivity = null;
  if (socket && ready) {
    try {
      send(OP.FRAME, {
        cmd: "SET_ACTIVITY",
        nonce: nextNonce(),
        args: { pid: process.pid, activity: null },
      });
      send(OP.CLOSE, { v: 1, client_id: clientId });
    } catch {
      // ignore
    }
  }
  teardown(false);
}

function formatRoundClock(roundDurationSec) {
  if (roundDurationSec == null || roundDurationSec === "") {
    return "";
  }
  const sec = Math.max(0, Math.round(Number(roundDurationSec) / 10));
  if (!Number.isFinite(sec)) {
    return "";
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) {
    return `${h}ч ${m}м`;
  }
  return `${m}м`;
}

function phaseLabel(gamestate) {
  const g = Number(gamestate);
  if (g === 1) return "В лобби";
  if (g === 2) return "Старт";
  if (g === 4) return "Конец раунда";
  return "";
}

function securityLabel(level) {
  const raw = String(level || "").trim().toLowerCase();
  if (!raw || raw === "unknown" || raw === "-") {
    return "";
  }
  const names = {
    green: "GREEN",
    blue: "BLUE",
    red: "RED",
    delta: "DELTA",
    gamma: "GAMMA",
    epsilon: "EPSILON",
    yellow: "YELLOW",
  };
  return names[raw] || raw.toUpperCase();
}

function cleanMapName(mapName) {
  const map = String(mapName || "").trim();
  if (!map || map === "-") {
    return "";
  }
  return map;
}

function buildLauncherActivity({ game, view, startedAt } = {}) {
  let state = "меню";
  if (view === "worlds") {
    state = "Выбор сервера";
  } else if (game === "grimrock") {
    state = "Grimrock";
  } else if (game === "dev") {
    state = "DEV";
  }
  return {
    pid: process.pid,
    details: "В лаунчере",
    state,
    timestamps: { start: unixSec(startedAt) },
  };
}

function buildPlayingActivity({ game, label, status, startedAt } = {}) {
  const prefix =
    game === "grimrock" ? "Grimrock" : game === "dev" ? "DEV" : "";
  const map = cleanMapName(status?.mapName);
  const phase = phaseLabel(status?.gamestate);
  const alert = game === "grimrock" ? "" : securityLabel(status?.securityLevel);
  const roundClock = formatRoundClock(status?.roundDurationSec);
  const players = status?.players;
  const playing = status?.playing;
  const roundId = status?.roundId;

  const detailBits = [];
  if (prefix) detailBits.push(prefix);
  if (phase) detailBits.push(phase);
  if (map) detailBits.push(map);
  if (roundClock && !phase) detailBits.push(roundClock);

  const stateBits = [];
  if (players != null && players !== "") {
    stateBits.push(`${players} онлайн`);
  } else if (playing != null && playing !== "") {
    stateBits.push(`${playing} на станции`);
  }
  if (alert) stateBits.push(alert);
  if (roundId) stateBits.push(`#${roundId}`);
  if (roundClock && phase) stateBits.push(roundClock);

  return {
    pid: process.pid,
    details: clip(detailBits.join(" · ") || label || "в игре"),
    state: clip(stateBits.join(" · ") || "в игре"),
    timestamps: { start: unixSec(startedAt) },
  };
}

module.exports = {
  start,
  stop,
  setActivity,
  clearActivity,
  buildLauncherActivity,
  buildPlayingActivity,
  clip,
};
