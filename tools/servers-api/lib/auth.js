const http = require("http");
const https = require("https");
const { URL } = require("url");
const { config } = require("./config");

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
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

function devUser() {
  return {
    id: "dev-owner",
    username: "local",
    globalName: "Локальный владелец",
  };
}

async function fetchAuthUser(token) {
  if (config.devBypass && token === "dev") {
    return { ok: true, user: devUser() };
  }
  const { status, data } = await requestJson(`${config.authApiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (status === 401) {
    return { ok: false, expired: true };
  }
  if (status < 200 || status >= 300 || !data?.ok || !data?.user?.id) {
    return { ok: false, error: data?.error || `auth_me_failed (${status})` };
  }
  return { ok: true, user: data.user, expiresAt: data.expiresAt };
}

function canSetFeaturedRole(userId) {
  if (!config.homeOwnerIds.length) {
    return config.devBypass && String(userId) === devUser().id;
  }
  return config.homeOwnerIds.includes(String(userId));
}

module.exports = { fetchAuthUser, canSetFeaturedRole };
