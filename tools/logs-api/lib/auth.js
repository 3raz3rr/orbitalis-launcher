const http = require("http");
const https = require("https");
const { URL } = require("url");
const { config } = require("./config");

const staffCache = new Map();
const STAFF_TTL_MS = 5 * 60 * 1000;

function requestJson(urlString, { method = "GET", headers = {}, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (error) {
      reject(error);
      return;
    }
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode || 0, data });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchAuthUser(token) {
  const { status, data } = await requestJson(`${config.authApiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (status === 401) {
    return { ok: false, expired: true };
  }
  if (status < 200 || status >= 300 || !data?.ok || !data?.user) {
    return {
      ok: false,
      error: data?.error || `auth_me_failed (${status})`,
    };
  }
  return { ok: true, user: data.user, expiresAt: data.expiresAt };
}

async function userHasAllowedRole(discordUserId) {
  if (config.devBypass) {
    return { ok: true, staff: true, bypass: true };
  }
  if (!config.discordBotToken) {
    return {
      ok: false,
      staff: false,
      error: "DISCORD_BOT_TOKEN not configured (or set LOGS_DEV_BYPASS=1)",
    };
  }
  const url = config.discordWorkerUrl
    ? `${config.discordWorkerUrl}/api/v10/guilds/${config.discordGuildId}/members/${discordUserId}`
    : `https://discord.com/api/v10/guilds/${config.discordGuildId}/members/${discordUserId}`;
  const { status, data } = await requestJson(url, {
    headers: { Authorization: `Bot ${config.discordBotToken}` },
  });
  if (status !== 200) {
    return {
      ok: false,
      staff: false,
      error: `discord_member_failed (${status})`,
    };
  }
  const roles = Array.isArray(data?.roles) ? data.roles.map(String) : [];
  const staff = config.allowedRoleIds.some((id) => roles.includes(String(id)));
  return { ok: true, staff, roles };
}

async function resolveStaff(token) {
  const me = await fetchAuthUser(token);
  if (!me.ok) {
    return me;
  }
  const userId = String(me.user?.id || "");
  if (!userId) {
    return { ok: false, error: "no_discord_id" };
  }

  const cached = staffCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ok: true,
      staff: cached.staff,
      user: me.user,
      bypass: cached.bypass,
      cached: true,
    };
  }

  const roles = await userHasAllowedRole(userId);
  const staff = Boolean(roles.staff || config.devBypass);
  const bypass = Boolean(roles.bypass || config.devBypass);
  staffCache.set(userId, {
    staff,
    bypass,
    expiresAt: Date.now() + STAFF_TTL_MS,
  });

  if (!roles.ok && !config.devBypass) {
    return {
      ok: true,
      staff: false,
      user: me.user,
      error: roles.error,
    };
  }
  return {
    ok: true,
    staff,
    user: me.user,
    bypass,
  };
}

module.exports = { resolveStaff, fetchAuthUser };
