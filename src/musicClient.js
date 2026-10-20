const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { lookupIpv4First } = require("./hostResolve");

function loadMusicConfig() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "musicConfig.json"), "utf8")
    );
  } catch {
    return { musicApiUrl: "" };
  }
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
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function wrapResult(status, data) {
  if (status === 401) {
    const err = data?.error || "unauthorized";
    return {
      ok: false,
      error: err,
      expired: err === "session_expired",
      message: data?.message,
    };
  }
  if (status === 403) {
    return {
      ok: false,
      error: data?.error || "forbidden",
      message: data?.message,
    };
  }
  if (status < 200 || status >= 300 || data?.ok === false) {
    return {
      ok: false,
      error: data?.error || data?.message || `music_failed (${status})`,
      message: data?.message,
    };
  }
  return data?.ok === undefined ? { ok: true, ...(data || {}) } : data;
}

async function musicMe(apiUrl, token) {
  const { status, data } = await requestJson(
    `${apiUrl.replace(/\/$/, "")}/api/v1/me`,
    { headers: authHeaders(token), timeoutMs: 10000 }
  );
  return wrapResult(status, data);
}

async function musicLibrary(apiUrl, token, kind, q = "") {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const qs = params.toString();
  const pathKind = kind === "public" ? "public" : "mine";
  const { status, data } = await requestJson(
    `${apiUrl.replace(/\/$/, "")}/api/v1/library/${pathKind}${
      qs ? `?${qs}` : ""
    }`,
    { headers: authHeaders(token), timeoutMs: 12000 }
  );
  return wrapResult(status, data);
}

async function musicPlaylistGet(apiUrl, token) {
  const { status, data } = await requestJson(
    `${apiUrl.replace(/\/$/, "")}/api/v1/playlist`,
    { headers: authHeaders(token), timeoutMs: 12000 }
  );
  return wrapResult(status, data);
}

async function musicPlaylistPut(apiUrl, token, trackIds) {
  const { status, data } = await requestJson(
    `${apiUrl.replace(/\/$/, "")}/api/v1/playlist`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: { trackIds },
      timeoutMs: 12000,
    }
  );
  return wrapResult(status, data);
}

async function musicDeleteTrack(apiUrl, token, trackId) {
  const { status, data } = await requestJson(
    `${apiUrl.replace(/\/$/, "")}/api/v1/tracks/${encodeURIComponent(trackId)}`,
    { method: "DELETE", headers: authHeaders(token), timeoutMs: 15000 }
  );
  return wrapResult(status, data);
}

async function musicPatchTrack(apiUrl, token, trackId, patch) {
  const { status, data } = await requestJson(
    `${apiUrl.replace(/\/$/, "")}/api/v1/tracks/${encodeURIComponent(trackId)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: patch,
      timeoutMs: 12000,
    }
  );
  return wrapResult(status, data);
}

async function musicImportUrl(
  apiUrl,
  token,
  { url, trackName, trackAuthor, visibility }
) {
  const { status, data } = await requestJson(
    `${apiUrl.replace(/\/$/, "")}/api/v1/import-url`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: {
        url,
        track_name: trackName || undefined,
        track_author: trackAuthor || undefined,
        visibility: visibility === "private" ? "private" : "public",
      },
      timeoutMs: 300000,
    }
  );
  return wrapResult(status, data);
}

async function musicUpload(
  apiUrl,
  token,
  { filePath, fileName, trackName, trackAuthor, visibility }
) {
  const boundary = `----orbitalis${Date.now().toString(16)}`;
  const fileBuf = fs.readFileSync(filePath);
  const chunks = [];
  const push = (s) => chunks.push(Buffer.from(s, "utf8"));
  const field = (name, value) => {
    push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  };
  field("track_name", trackName || fileName || "Track");
  field("track_author", trackAuthor || "Unknown artist");
  field("visibility", visibility === "private" ? "private" : "public");
  push(
    `--${boundary}\r\nContent-Disposition: form-data; name="track"; filename="${String(
      fileName || "track.bin"
    ).replace(/"/g, "")}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  chunks.push(fileBuf);
  push(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat(chunks);

  return new Promise((resolve, reject) => {
    const parsed = new URL(
      `${apiUrl.replace(/\/$/, "")}/api/v1/upload`
    );
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        family: 4,
        lookup: lookupIpv4First,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          "User-Agent": "OrbitalisLauncher",
        },
        timeout: 180000,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }
          resolve(wrapResult(res.statusCode, data));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function musicDownloadToTemp(apiUrl, token, trackId) {
  const tmp = path.join(
    require("os").tmpdir(),
    `orbitalis-music-${String(trackId).replace(/[^\w.-]+/g, "_")}.ogg`
  );
  return new Promise((resolve, reject) => {
    const parsed = new URL(
      `${apiUrl.replace(/\/$/, "")}/api/v1/file/${encodeURIComponent(trackId)}`
    );
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
          Authorization: `Bearer ${token}`,
          "User-Agent": "OrbitalisLauncher",
        },
        timeout: 120000,
      },
      (res) => {
        if (res.statusCode === 401) {
          resolve({ ok: false, expired: true });
          res.resume();
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve({ ok: false, error: `stream_failed (${res.statusCode})` });
          res.resume();
          return;
        }
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on("finish", () => {
          const fileUrl = require("url").pathToFileURL(tmp).href;
          resolve({ ok: true, path: tmp, fileUrl });
        });
        out.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

module.exports = {
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
};
