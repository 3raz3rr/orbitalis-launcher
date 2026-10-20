const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { safeStorage } = require("electron");
const { lookupIpv4First } = require("./hostResolve");

function loadAuthConfig() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "authConfig.json"), "utf8")
  );
}

function sessionPath(userData) {
  return path.join(userData, "discord-session.bin");
}

function saveSessionToken(userData, token) {
  const file = sessionPath(userData);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(String(token));
    fs.writeFileSync(file, encrypted);
    return;
  }
  fs.writeFileSync(`${file}.plain`, String(token), "utf8");
}

function readSessionToken(userData) {
  const file = sessionPath(userData);
  try {
    if (safeStorage.isEncryptionAvailable() && fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      return safeStorage.decryptString(buf);
    }
    const plain = `${file}.plain`;
    if (fs.existsSync(plain)) {
      return fs.readFileSync(plain, "utf8").trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function clearSessionToken(userData) {
  const file = sessionPath(userData);
  for (const candidate of [file, `${file}.plain`]) {
    try {
      fs.unlinkSync(candidate);
    } catch {
      // ignore
    }
  }
}

function friendlyAuthError(error, authApiUrl) {
  let host = "auth.hornyjail.space";
  try {
    host = new URL(authApiUrl).hostname || host;
  } catch {
    // ignore
  }
  const msg = String(error?.message || error || "");
  if (/timeout/i.test(msg)) {
    return `Сервер входа не ответил (${host}). Проверь интернет/VPN или попробуй позже.`;
  }
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) {
    return `Не удалось найти ${host} (DNS).`;
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return `${host} отклонил соединение.`;
  }
  if (/ECONNRESET|EPIPE/i.test(msg)) {
    return `Соединение с ${host} оборвалось. Попробуй ещё раз.`;
  }
  if (/ENETUNREACH|EHOSTUNREACH/i.test(msg)) {
    return `Нет маршрута до ${host}. Проверь VPN/файрвол.`;
  }
  if (/CERT|SSL|TLS|unable to verify/i.test(msg)) {
    return `Ошибка HTTPS при обращении к ${host}.`;
  }
  return msg || "Ошибка входа";
}

function requestJsonOnce(
  url,
  { method = "GET", headers = {}, body, timeoutMs = 20000 } = {}
) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "http:" ? http : https;
    const payload = body == null ? null : JSON.stringify(body);
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        family: 4,
        lookup: lookupIpv4First,
        headers: {
          Accept: "application/json",
          "User-Agent": "OrbitalisLauncher",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function requestJson(url, options = {}) {
  const retries = Number(options.retries);
  const maxAttempts = Number.isFinite(retries) ? Math.max(0, retries) + 1 : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestJsonOnce(url, options);
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || error || "");
      const retryable = /timeout|ECONNRESET|EPIPE|ENETUNREACH|EHOSTUNREACH/i.test(
        msg
      );
      if (!retryable || attempt >= maxAttempts) throw error;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastError || new Error("request_failed");
}

async function startDiscordLogin(authApiUrl) {
  try {
    const { status, data } = await requestJson(
      `${authApiUrl.replace(/\/$/, "")}/auth/discord/start?force=1`,
      { timeoutMs: 25000 }
    );
    if (status < 200 || status >= 300 || !data?.authorizeUrl) {
      throw new Error(data?.error || `Auth start failed (${status})`);
    }
    return data;
  } catch (error) {
    throw new Error(friendlyAuthError(error, authApiUrl));
  }
}

async function fetchMe(authApiUrl, token, { timeoutMs = 10000 } = {}) {
  const { status, data } = await requestJson(
    `${authApiUrl.replace(/\/$/, "")}/auth/me`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs,
      retries: 1,
    }
  );
  if (status === 401) {
    return { ok: false, expired: true };
  }
  if (status < 200 || status >= 300 || !data?.ok) {
    throw new Error(data?.error || `Auth me failed (${status})`);
  }
  return { ok: true, user: data.user, expiresAt: data.expiresAt };
}

async function logoutRemote(authApiUrl, token) {
  try {
    await requestJson(`${authApiUrl.replace(/\/$/, "")}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // ignore network errors on logout
  }
}

function normalizeStatusKind(kind) {
  if (kind === "dev") {
    return "dev";
  }
  if (kind === "grim") {
    return "grim";
  }
  return "main";
}

async function fetchServerStatus(authApiUrl, kind) {
  const safeKind = normalizeStatusKind(kind);
  try {
    const { status, data } = await requestJson(
      `${authApiUrl.replace(/\/$/, "")}/api/status/${safeKind}`,
      { timeoutMs: 10000, retries: 1 }
    );
    if (status < 200 || status >= 300 || !data?.ok) {
      return {
        ok: false,
        kind: safeKind,
        error: data?.error || `status_failed (${status})`,
      };
    }
    return data;
  } catch (error) {
    return {
      ok: false,
      kind: safeKind,
      error: error?.message ? error.message : String(error),
    };
  }
}

async function fetchPlayerCard(authApiUrl, token, kind) {
  const requested = normalizeStatusKind(kind);
  // Grimrock has no player DB in auth — always Orbitalis (main/dev).
  const safeKind = requested === "grim" ? "main" : requested;
  const query = new URLSearchParams({ kind: safeKind, game: "orbitalis" });
  const { status, data } = await requestJson(
    `${authApiUrl.replace(/\/$/, "")}/api/me/player?${query.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (status === 401) {
    return { ok: false, expired: true };
  }
  if (status < 200 || status >= 300 || !data?.ok) {
    return {
      ok: false,
      kind: safeKind,
      game: "orbitalis",
      error: data?.error || `player_failed (${status})`,
    };
  }
  return {
    ...data,
    kind: data.kind || safeKind,
    game: data.game || "orbitalis",
  };
}

function parseAuthProtocolUrl(urlString) {
  try {
    const raw = String(urlString || "");
    if (!raw.startsWith("orbitalis://")) {
      return null;
    }
    const url = new URL(raw);
    const token = url.searchParams.get("token");
    if (!token) {
      return null;
    }
    return {
      token,
      expiresAt: Number(url.searchParams.get("expires") || 0) || null,
    };
  } catch {
    return null;
  }
}

module.exports = {
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
};
