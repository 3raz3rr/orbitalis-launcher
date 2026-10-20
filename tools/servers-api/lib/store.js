const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { config } = require("./config");
const { canSetFeaturedRole } = require("./auth");

const BACKGROUNDS = new Set(["orbitalis", "grimrock", "plain"]);
const AUTH_MODES = new Set(["discord", "byond"]);
const ROLES = new Set(["home", "sibling", "guest"]);
const BYOND_MAJORS = new Set([513, 514, 515, 516]);

function emptyDb() {
  return { servers: [], tickets: [] };
}

function readDb() {
  try {
    const raw = fs.readFileSync(config.dataFile, "utf8");
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.servers) || !Array.isArray(data.tickets)) {
      return emptyDb();
    }
    return data;
  } catch {
    return emptyDb();
  }
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
  const tmp = `${config.dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, config.dataFile);
}

let chain = Promise.resolve();

function update(mutator) {
  const run = chain.then(() => {
    const db = readDb();
    const result = mutator(db);
    writeDb(db);
    return result;
  });
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

function cleanHost(value) {
  const host = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{0,252}$/.test(host) || host.includes("..")) {
    return null;
  }
  return host;
}

function parseInput(input, { userId, previous } = {}) {
  const src = input && typeof input === "object" ? input : {};
  const name = String(src.name || "").trim();
  if (name.length < 1 || name.length > 48) {
    return { error: "Название от 1 до 48 символов" };
  }
  const host = cleanHost(src.host);
  if (!host) {
    return { error: "Нужен хост без схемы и порта, например play.example.com" };
  }
  const port = Number(src.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "Порт от 1 до 65535" };
  }
  const byondMajor = Number(src.byondMajor);
  if (!BYOND_MAJORS.has(byondMajor)) {
    return { error: "Версия BYOND: 513, 514, 515 или 516" };
  }
  const authMode = String(src.authMode || "");
  if (!AUTH_MODES.has(authMode)) {
    return { error: "Вход: discord или byond" };
  }
  const background = String(src.background || "plain");
  if (!BACKGROUNDS.has(background)) {
    return { error: "Фон: orbitalis, grimrock или plain" };
  }
  let role = String(src.role || previous?.role || "guest");
  if (!ROLES.has(role)) {
    return { error: "Роль: home, sibling или guest" };
  }
  if ((role === "home" || role === "sibling") && !canSetFeaturedRole(userId)) {
    if (!(previous && previous.role === role)) {
      return { error: "Роли «дом» и «наш» ставят только свои проекты" };
    }
  }
  return {
    value: { name, host, port, byondMajor, authMode, background, role },
  };
}

function publicServer(server, now = Date.now()) {
  const status = server.status || null;
  const live = Boolean(status && now - status.updatedAt <= config.statusTtlMs);
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    byondMajor: server.byondMajor,
    authMode: server.authMode,
    background: server.background,
    role: server.role,
    live,
    status: live ? status : null,
  };
}

function ownerServer(server) {
  return {
    ...publicServer(server),
    status: server.status || null,
    token: server.token,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

function sortServers(list) {
  const rank = { home: 0, sibling: 1, guest: 2 };
  return list.slice().sort((a, b) => {
    const byRole = (rank[a.role] ?? 9) - (rank[b.role] ?? 9);
    if (byRole) return byRole;
    return String(a.name).localeCompare(String(b.name), "ru");
  });
}

function pruneTickets(db, now) {
  db.tickets = db.tickets.filter((ticket) => !ticket.used && ticket.expiresAt > now);
}

function findByToken(db, token) {
  return db.servers.find((server) => server.token === token) || null;
}

function catalog() {
  const db = readDb();
  return sortServers(db.servers.map((server) => publicServer(server)));
}

function mine(ownerId) {
  const db = readDb();
  return sortServers(
    db.servers
      .filter((server) => server.ownerId === String(ownerId))
      .map((server) => ownerServer(server))
  );
}

function getOwned(ownerId, id) {
  const db = readDb();
  const server = db.servers.find((item) => item.id === id) || null;
  if (!server || server.ownerId !== String(ownerId)) return null;
  return ownerServer(server);
}

function createServer(user, input) {
  const parsed = parseInput(input, { userId: user.id });
  if (parsed.error) return { error: parsed.error };
  return update((db) => {
    const now = Date.now();
    const server = {
      id: newId("srv"),
      ownerId: String(user.id),
      ownerName: user.globalName || user.username || "",
      token: newToken(),
      ...parsed.value,
      status: null,
      createdAt: now,
      updatedAt: now,
    };
    db.servers.push(server);
    return { server: ownerServer(server) };
  });
}

function updateServer(user, id, input) {
  const dbNow = readDb();
  const current = dbNow.servers.find((item) => item.id === id);
  if (!current || current.ownerId !== String(user.id)) {
    return Promise.resolve({ error: "not_found", status: 404 });
  }
  const parsed = parseInput(
    { ...current, ...input },
    { userId: user.id, previous: current }
  );
  if (parsed.error) return Promise.resolve({ error: parsed.error, status: 400 });
  return update((db) => {
    const server = db.servers.find((item) => item.id === id);
    if (!server || server.ownerId !== String(user.id)) {
      return { error: "not_found", status: 404 };
    }
    Object.assign(server, parsed.value, { updatedAt: Date.now() });
    return { server: ownerServer(server) };
  });
}

function deleteServer(user, id) {
  return update((db) => {
    const index = db.servers.findIndex(
      (item) => item.id === id && item.ownerId === String(user.id)
    );
    if (index < 0) return { error: "not_found", status: 404 };
    db.servers.splice(index, 1);
    db.tickets = db.tickets.filter((ticket) => ticket.serverId !== id);
    return { ok: true };
  });
}

function rotateToken(user, id) {
  return update((db) => {
    const server = db.servers.find(
      (item) => item.id === id && item.ownerId === String(user.id)
    );
    if (!server) return { error: "not_found", status: 404 };
    server.token = newToken();
    server.updatedAt = Date.now();
    db.tickets = db.tickets.filter((ticket) => ticket.serverId !== id);
    return { server: ownerServer(server) };
  });
}

function normalizeStatus(input) {
  const src = input && typeof input === "object" ? input : {};
  const num = (value) => {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const text = (value, max) => {
    const s = String(value == null ? "" : value).trim();
    if (!s) return "";
    return s.slice(0, max);
  };
  return {
    players: num(src.players),
    playing: num(src.playing),
    mapName: text(src.mapName, 80),
    securityLevel: text(src.securityLevel, 24).toLowerCase(),
    roundId: text(src.roundId, 24),
    roundDurationSec: num(src.roundDurationSec),
    gamestate: num(src.gamestate),
    updatedAt: Date.now(),
  };
}

function ingestStatus(token, input) {
  return update((db) => {
    const server = findByToken(db, token);
    if (!server) return { error: "bad_token", status: 401 };
    server.status = normalizeStatus(input);
    server.updatedAt = Date.now();
    return { ok: true };
  });
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const raw = forwarded || req.socket.remoteAddress || "";
  return raw.replace(/^::ffff:/, "");
}

function createTicket(user, serverId, ip) {
  return update((db) => {
    const server = db.servers.find((item) => item.id === serverId);
    if (!server) return { error: "not_found", status: 404 };
    if (server.authMode !== "discord") {
      return {
        ticket: null,
        connect: `byond://${server.host}:${server.port}`,
        authMode: server.authMode,
      };
    }
    const now = Date.now();
    pruneTickets(db, now);
    const ticket = {
      id: newToken(),
      serverId: server.id,
      userId: String(user.id),
      username: user.username || "",
      globalName: user.globalName || user.username || "",
      ip: ip || "",
      createdAt: now,
      expiresAt: now + config.ticketTtlMs,
      used: false,
    };
    db.tickets.push(ticket);
    return {
      ticket: ticket.id,
      expiresAt: ticket.expiresAt,
      connect: `byond://${server.host}:${server.port}?orbitalis_ticket=${ticket.id}`,
      authMode: "discord",
    };
  });
}

function takeTicket(db, server, { ticket, address }) {
  const now = Date.now();
  pruneTickets(db, now);
  const pending = db.tickets.filter((item) => item.serverId === server.id && !item.used);
  if (ticket) {
    return pending.find((item) => item.id === ticket) || null;
  }
  const addr = String(address || "").replace(/^::ffff:/, "");
  if (addr) {
    const byIp = pending.filter((item) => item.ip && item.ip === addr);
    if (byIp.length === 1) return byIp[0];
  }
  if (pending.length === 1) return pending[0];
  return null;
}

function ingestLogin(token, input) {
  const src = input && typeof input === "object" ? input : {};
  return update((db) => {
    const server = findByToken(db, token);
    if (!server) return { error: "bad_token", status: 401 };
    if (server.authMode !== "discord") {
      return { ok: true, authMode: "byond", discord: null };
    }
    const found = takeTicket(db, server, {
      ticket: String(src.ticket || ""),
      address: String(src.address || ""),
    });
    if (!found) return { error: "no_ticket", status: 404 };
    found.used = true;
    db.tickets = db.tickets.filter((item) => item.id !== found.id);
    return {
      ok: true,
      authMode: "discord",
      ckey: String(src.ckey || ""),
      discord: {
        id: found.userId,
        username: found.username,
        globalName: found.globalName,
      },
    };
  });
}

module.exports = {
  catalog,
  mine,
  getOwned,
  createServer,
  updateServer,
  deleteServer,
  rotateToken,
  ingestStatus,
  ingestLogin,
  createTicket,
  clientIp,
};
