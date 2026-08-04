const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const dns = require("dns");

function loadLogsConfig() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "logsConfig.json"), "utf8")
    );
  } catch {
    return { logsApiUrl: "" };
  }
}

function lookupIpv4First(hostname, options, callback) {
  dns.lookup(hostname, { family: 4, all: false }, (error, address, family) => {
    if (!error) {
      callback(null, address, family);
      return;
    }
    dns.lookup(hostname, options || {}, callback);
  });
}

function requestJson(
  url,
  { method = "GET", headers = {}, body, timeoutMs = 60000 } = {}
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

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function logsMe(logsApiUrl, token) {
  const { status, data } = await requestJson(
    `${logsApiUrl.replace(/\/$/, "")}/api/me`,
    { headers: authHeaders(token), timeoutMs: 20000 }
  );
  if (status === 401) {
    return { ok: false, expired: true };
  }
  if (status < 200 || status >= 300) {
    return {
      ok: false,
      error: data?.error || `logs_me_failed (${status})`,
      staff: false,
    };
  }
  return data;
}

async function logsTree(logsApiUrl, token, query = {}) {
  const params = new URLSearchParams();
  for (const key of ["year", "month", "day", "round"]) {
    if (query[key]) params.set(key, query[key]);
  }
  const qs = params.toString();
  const { status, data } = await requestJson(
    `${logsApiUrl.replace(/\/$/, "")}/api/tree${qs ? `?${qs}` : ""}`,
    { headers: authHeaders(token), timeoutMs: 30000 }
  );
  if (status === 401) return { ok: false, expired: true };
  if (status === 403) return { ok: false, error: "forbidden", staff: false };
  if (status < 200 || status >= 300 || !data?.ok) {
    return { ok: false, error: data?.error || `logs_tree_failed (${status})` };
  }
  return data;
}

async function logsRound(logsApiUrl, token, query) {
  const params = new URLSearchParams({
    year: query.year,
    month: query.month,
    day: query.day,
    round: query.round,
  });
  if (query.fields) params.set("fields", query.fields);
  const { status, data } = await requestJson(
    `${logsApiUrl.replace(/\/$/, "")}/api/round?${params}`,
    { headers: authHeaders(token), timeoutMs: 120000 }
  );
  if (status === 401) return { ok: false, expired: true };
  if (status === 403) return { ok: false, error: "forbidden", staff: false };
  if (status < 200 || status >= 300 || !data?.ok) {
    return { ok: false, error: data?.error || `logs_round_failed (${status})` };
  }
  return data;
}

async function logsGenerate(logsApiUrl, token, files) {
  const { status, data } = await requestJson(
    `${logsApiUrl.replace(/\/$/, "")}/api/generate`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: { files },
      timeoutMs: 120000,
    }
  );
  if (status === 401) return { ok: false, expired: true };
  if (status === 403) return { ok: false, error: "forbidden", staff: false };
  if (status < 200 || status >= 300 || !data?.ok) {
    return {
      ok: false,
      error: data?.error || `logs_generate_failed (${status})`,
    };
  }
  return data;
}

async function logsView(logsApiUrl, token, jobId, page = 1, { all = false } = {}) {
  const params = new URLSearchParams({
    jobId: String(jobId),
    page: String(page),
  });
  if (all) params.set("all", "1");
  const { status, data } = await requestJson(
    `${logsApiUrl.replace(/\/$/, "")}/api/view?${params}`,
    { headers: authHeaders(token), timeoutMs: all ? 180000 : 60000 }
  );
  if (status === 401) return { ok: false, expired: true };
  if (status === 403) return { ok: false, error: "forbidden", staff: false };
  if (status < 200 || status >= 300 || !data?.ok) {
    return { ok: false, error: data?.error || `logs_view_failed (${status})` };
  }
  return data;
}

module.exports = {
  loadLogsConfig,
  logsMe,
  logsTree,
  logsRound,
  logsGenerate,
  logsView,
};
