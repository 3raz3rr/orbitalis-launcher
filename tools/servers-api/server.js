const http = require("http");
const fs = require("fs");
const path = require("path");
const { config } = require("./lib/config");
const { fetchAuthUser, canSetFeaturedRole } = require("./lib/auth");
const {
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
} = require("./lib/store");
const { bridgeSource } = require("./lib/bridge");
const { createSession, readSession, deleteSession } = require("./lib/sessions");
const { authorizeUrl, userFromCode } = require("./lib/discordOAuth");

const publicDir = path.join(__dirname, "public");

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    ...extraHeaders,
  });
  res.end(payload);
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function sessionCookie(id) {
  const secure = config.publicUrl.startsWith("https://") ? "; Secure" : "";
  if (!id) {
    return `sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
  return `sid=${encodeURIComponent(id)}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      const type = String(req.headers["content-type"] || "");
      if (type.includes("application/x-www-form-urlencoded")) {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function tokenFrom(req, body) {
  return bearer(req) || String(body?.token || "");
}

async function requireUser(req, res) {
  const session = readSession(cookies(req).sid);
  if (session?.user) return session.user;
  const token = bearer(req);
  if (!token) {
    sendJson(res, 401, { ok: false, error: "Нужен вход" });
    return null;
  }
  let result;
  try {
    result = await fetchAuthUser(token);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: error?.message ? error.message : String(error),
    });
    return null;
  }
  if (!result.ok) {
    sendJson(res, 401, { ok: false, error: result.error || "Сессия недействительна" });
    return null;
  }
  return result.user;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".ttf": "font/ttf",
  };
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

async function handle(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  const url = new URL(req.url, config.publicUrl);
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      devBypass: config.devBypass,
      discord: Boolean(config.discordClientSecret),
      publicUrl: config.publicUrl,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/discord") {
    if (!config.discordClientSecret) {
      sendJson(res, 501, {
        ok: false,
        error: "На сервере не задан DISCORD_CLIENT_SECRET",
      });
      return;
    }
    res.writeHead(302, { Location: authorizeUrl() });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/discord/callback") {
    try {
      const user = await userFromCode(url.searchParams.get("code") || "");
      const sid = createSession(user);
      res.writeHead(302, {
        Location: "/#mine",
        "Set-Cookie": sessionCookie(sid),
      });
      res.end();
    } catch (error) {
      sendJson(res, 401, {
        ok: false,
        error: error?.message ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    deleteSession(cookies(req).sid);
    sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("") });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/catalog") {
    sendJson(res, 200, { ok: true, servers: catalog() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/dev/login") {
    if (!config.devBypass) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    const user = await fetchAuthUser("dev");
    const sid = createSession(user.user);
    sendJson(res, 200, { ok: true, token: "dev", user: user.user }, {
      "Set-Cookie": sessionCookie(sid),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = await requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, {
      ok: true,
      user,
      featured: canSetFeaturedRole(user.id),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mine") {
    const user = await requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { ok: true, servers: mine(user.id) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/servers") {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = await createServer(user, body);
    if (result.error) {
      sendJson(res, result.status || 400, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 201, { ok: true, server: result.server });
    return;
  }

  if (parts[0] === "api" && parts[1] === "servers" && parts[2] && parts.length === 3) {
    const user = await requireUser(req, res);
    if (!user) return;
    const id = parts[2];
    if (req.method === "PATCH") {
      const body = await readBody(req);
      const result = await updateServer(user, id, body);
      if (result.error) {
        sendJson(res, result.status || 400, { ok: false, error: result.error });
        return;
      }
      sendJson(res, 200, { ok: true, server: result.server });
      return;
    }
    if (req.method === "DELETE") {
      const result = await deleteServer(user, id);
      if (result.error) {
        sendJson(res, result.status || 400, { ok: false, error: result.error });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (
    req.method === "POST" &&
    parts[0] === "api" &&
    parts[1] === "servers" &&
    parts[3] === "token"
  ) {
    const user = await requireUser(req, res);
    if (!user) return;
    const result = await rotateToken(user, parts[2]);
    if (result.error) {
      sendJson(res, result.status || 400, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, server: result.server });
    return;
  }

  if (
    req.method === "GET" &&
    parts[0] === "api" &&
    parts[1] === "servers" &&
    parts[3] === "package"
  ) {
    const user = await requireUser(req, res);
    if (!user) return;
    const server = getOwned(user.id, parts[2]);
    if (!server) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    const source = bridgeSource(server);
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="orbitalis_bridge.dm"',
      "Cache-Control": "no-store",
    });
    res.end(source);
    return;
  }

  if (req.method === "POST" && parts[0] === "api" && parts[1] === "servers" && parts[3] === "play") {
    const user = await requireUser(req, res);
    if (!user) return;
    const result = await createTicket(user, parts[2], clientIp(req));
    if (result.error) {
      sendJson(res, result.status || 400, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ingest/status") {
    const body = await readBody(req);
    const result = await ingestStatus(tokenFrom(req, body), body);
    if (result.error) {
      sendJson(res, result.status || 400, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ingest/login") {
    const body = await readBody(req);
    const result = await ingestLogin(tokenFrom(req, body), body);
    if (result.error) {
      sendJson(res, result.status || 400, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/media/")) {
    const name = path.basename(url.pathname);
    const filePath = path.join(publicDir, "media", name);
    if (fs.existsSync(filePath)) {
      sendFile(res, filePath);
      return;
    }
  }

  if (req.method === "GET") {
    const pages = {
      "/": "index.html",
      "/index.html": "index.html",
      "/site.css": "site.css",
      "/site.js": "site.js",
    };
    const page = pages[url.pathname];
    if (page) {
      sendFile(res, path.join(publicDir, page));
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: "not_found" });
}

function start(port = config.port, host = config.host) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) return;
      sendJson(res, 400, {
        ok: false,
        error: error?.message ? error.message : String(error),
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

if (require.main === module) {
  start().then((server) => {
    const address = server.address();
    console.log(
      `servers-api http://${config.host}:${address.port}  dev=${config.devBypass}`
    );
  });
}

module.exports = { start };
