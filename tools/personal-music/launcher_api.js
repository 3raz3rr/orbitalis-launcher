"use strict";

/**
 * Launcher JSON API for personal music service.
 * Attached onto the existing Express app without breaking HTML upload/library pages.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

function loadDotEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Unreadable env files are fine when systemd EnvironmentFile already injected vars.
  }
}

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
        family: 4,
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

function publicTrack(meta, baseUrl) {
  const id = meta.id;
  return {
    id,
    display_id: meta.display_id || id,
    name: meta.name || "Track",
    author: meta.author || "Unknown artist",
    ckey: meta.ckey || null,
    visibility: meta.visibility === "private" ? "private" : "public",
    duration_ds: meta.duration_ds || 0,
    duration_seconds: meta.duration_seconds || 0,
    size_bytes: meta.size_bytes || 0,
    created_at: meta.created_at || null,
    stream_url: `${baseUrl}/api/v1/file/${encodeURIComponent(id)}`,
  };
}

function attachLauncherApi(app, ctx) {
  const {
    BASE_DIR,
    STORAGE_DIR,
    upload,
    makeTrackId,
    runFfmpegToOgg,
    getDurationSeconds,
    saveTrackMeta,
    loadTrackMeta,
    listAllMetas,
    deriveTrackId,
    toRelativeFromBase,
    makeBaseUrl,
  } = ctx;

  loadDotEnv("/etc/orbitalis/discord.env");
  loadDotEnv("/etc/orbitalis/logs-api.env");

  const AUTH_API_URL = (
    process.env.AUTH_API_URL || "https://auth.hornyjail.space"
  ).replace(/\/$/, "");
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
  const DISCORD_GUILD_ID = String(
    process.env.DISCORD_GUILD_ID || "1381270148664655902"
  );
  const LEADER_ROLE_IDS = String(
    process.env.LEADER_ROLE_IDS ||
      process.env.MUSIC_LEADER_ROLE_IDS ||
      "1428312614450106390"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const DISCORD_WORKER_URL = (
    process.env.DISCORD_WORKER_URL || ""
  ).replace(/\/$/, "");

  const PLAYLIST_DIR = path.join(BASE_DIR, "data", "personal_music_playlists");
  fs.mkdirSync(PLAYLIST_DIR, { recursive: true });

  const roleCache = new Map();
  const ROLE_TTL_MS = 5 * 60 * 1000;

  app.use(require("express").json({ limit: "1mb" }));

  function getBearer(req) {
    const h = req.headers.authorization || "";
    const m = String(h).match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
  }

  async function fetchAuthUser(token) {
    const { status, data } = await requestJson(`${AUTH_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (status === 401) return { ok: false, expired: true };
    if (status < 200 || status >= 300 || !data?.ok || !data?.user) {
      return { ok: false, error: data?.error || `auth_me_failed (${status})` };
    }
    return { ok: true, user: data.user };
  }

  async function hasLeaderRole(discordUserId) {
    if (!DISCORD_BOT_TOKEN || !LEADER_ROLE_IDS.length) return false;
    const cached = roleCache.get(discordUserId);
    if (cached && cached.expiresAt > Date.now()) return cached.leader;

    const url = DISCORD_WORKER_URL
      ? `${DISCORD_WORKER_URL}/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`
      : `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`;
    const { status, data } = await requestJson(url, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });
    let leader = false;
    if (status === 200) {
      const roles = Array.isArray(data?.roles) ? data.roles.map(String) : [];
      leader = LEADER_ROLE_IDS.some((id) => roles.includes(String(id)));
    }
    roleCache.set(discordUserId, {
      leader,
      expiresAt: Date.now() + ROLE_TTL_MS,
    });
    return leader;
  }

  async function requireLauncherUser(req, res) {
    const token = getBearer(req);
    if (!token) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return null;
    }
    let auth;
    try {
      auth = await fetchAuthUser(token);
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: error?.message ? error.message : String(error),
      });
      return null;
    }
    if (auth.expired) {
      res.status(401).json({ ok: false, error: "session_expired" });
      return null;
    }
    if (!auth.ok) {
      res.status(401).json({ ok: false, error: auth.error || "unauthorized" });
      return null;
    }
    const ckeyFromAuth = String(auth.user?.ckey || "")
      .trim()
      .toLowerCase();
    let ckey = ckeyFromAuth;
    if (!ckey) {
      try {
        const player = await requestJson(`${AUTH_API_URL}/api/me/player`, {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 20000,
        });
        if (player.status === 401) {
          res.status(401).json({ ok: false, error: "session_expired" });
          return null;
        }
        ckey = String(
          player.data?.player?.ckey || player.data?.user?.ckey || ""
        )
          .trim()
          .toLowerCase();
      } catch (error) {
        res.status(502).json({
          ok: false,
          error: error?.message ? error.message : String(error),
        });
        return null;
      }
    }
    if (!ckey) {
      res.status(403).json({
        ok: false,
        error: "ckey_not_linked",
        message: "Discord не привязан к ckey",
      });
      return null;
    }
    const canModerate = await hasLeaderRole(String(auth.user.id || ""));
    return { user: auth.user, ckey, canModerate, token };
  }

  function playlistPath(ckey) {
    const safe = String(ckey || "")
      .toLowerCase()
      .replace(/[^a-z0-9_\-]/g, "_");
    return path.join(PLAYLIST_DIR, `${safe}.json`);
  }

  function loadPlaylist(ckey) {
    const file = playlistPath(ckey);
    if (!fs.existsSync(file)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(data?.trackIds) ? data.trackIds.map(String) : [];
    } catch {
      return [];
    }
  }

  function savePlaylist(ckey, trackIds) {
    const file = playlistPath(ckey);
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          ckey,
          trackIds: trackIds.map(String),
          updated_at: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );
  }

  function isPublic(meta) {
    return meta && meta.visibility !== "private";
  }

  function ownedBy(meta, ckey) {
    return (
      String(meta?.ckey || "")
        .trim()
        .toLowerCase() === String(ckey || "").toLowerCase()
    );
  }

  app.get("/api/v1/health", (_req, res) => {
    res.json({ ok: true, service: "personal-music-launcher-api" });
  });

  app.get("/api/v1/me", async (req, res) => {
    const ctxUser = await requireLauncherUser(req, res);
    if (!ctxUser) return;
    res.json({
      ok: true,
      ckey: ctxUser.ckey,
      canModerate: ctxUser.canModerate,
      user: {
        id: ctxUser.user.id,
        username: ctxUser.user.username,
        globalName: ctxUser.user.globalName,
        avatarUrl: ctxUser.user.avatarUrl,
      },
    });
  });

  app.get("/api/v1/library/mine", async (req, res) => {
    const ctxUser = await requireLauncherUser(req, res);
    if (!ctxUser) return;
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    const baseUrl = makeBaseUrl(req);
    const tracks = listAllMetas()
      .filter((m) => ownedBy(m, ctxUser.ckey))
      .filter((m) => {
        if (!q) return true;
        return (
          String(m.name || "")
            .toLowerCase()
            .includes(q) ||
          String(m.author || "")
            .toLowerCase()
            .includes(q)
        );
      })
      .map((m) => {
        m.display_id = deriveTrackId(m);
        return publicTrack(m, baseUrl);
      })
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    res.json({ ok: true, ckey: ctxUser.ckey, tracks });
  });

  app.get("/api/v1/library/public", async (req, res) => {
    const ctxUser = await requireLauncherUser(req, res);
    if (!ctxUser) return;
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    const baseUrl = makeBaseUrl(req);
    const tracks = listAllMetas()
      .filter((m) => isPublic(m))
      .filter((m) => {
        if (!q) return true;
        return (
          String(m.name || "")
            .toLowerCase()
            .includes(q) ||
          String(m.author || "")
            .toLowerCase()
            .includes(q) ||
          String(m.ckey || "")
            .toLowerCase()
            .includes(q)
        );
      })
      .map((m) => {
        m.display_id = deriveTrackId(m);
        return publicTrack(m, baseUrl);
      })
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    res.json({ ok: true, tracks });
  });

  app.post("/api/v1/upload", upload.single("track"), async (req, res) => {
    const ctxUser = await requireLauncherUser(req, res);
    if (!ctxUser) {
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // ignore
        }
      }
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "No file uploaded" });
      return;
    }

    const trackName =
      String(req.body.track_name || "").trim() || file.originalname || "Track";
    const trackAuthor =
      String(req.body.track_author || "").trim() || "Unknown artist";
    const visibility =
      String(req.body.visibility || "public").toLowerCase() === "private"
        ? "private"
        : "public";

    try {
      const trackId = makeTrackId(ctxUser.ckey);
      const tmpPath = file.path;
      const finalOggPath = path.join(STORAGE_DIR, `${trackId}.ogg`);
      runFfmpegToOgg(tmpPath, finalOggPath);
      const durationSeconds = getDurationSeconds(finalOggPath);
      const durationDs = Math.round(durationSeconds * 10);
      const sizeBytes = fs.statSync(finalOggPath).size;
      const meta = {
        id: trackId,
        ckey: ctxUser.ckey,
        name: trackName,
        author: trackAuthor,
        visibility,
        path_abs: finalOggPath,
        path: toRelativeFromBase(finalOggPath),
        duration_seconds: durationSeconds,
        duration_ds: durationDs,
        size_bytes: sizeBytes,
        codec: "vorbis",
        format: "ogg",
        created_at: new Date().toISOString(),
        original_filename: file.originalname || "track",
        source: "launcher",
      };
      saveTrackMeta(meta);
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
      const baseUrl = makeBaseUrl(req);
      meta.display_id = deriveTrackId(meta);
      res.json({ ok: true, track: publicTrack(meta, baseUrl) });
    } catch (error) {
      if (file?.path) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
      }
      res.status(500).json({
        ok: false,
        error: error?.message ? error.message : String(error),
      });
    }
  });

  app.delete("/api/v1/tracks/:id", async (req, res) => {
    const ctxUser = await requireLauncherUser(req, res);
    if (!ctxUser) return;
    const trackId = String(req.params.id || "").trim();
    const meta = loadTrackMeta(trackId);
    if (!meta) {
      res.status(404).json({ ok: false, error: "Track not found" });
      return;
    }
    const isOwner = ownedBy(meta, ctxUser.ckey);
    const canDeletePublic =
      ctxUser.canModerate && isPublic(meta) && !isOwner
        ? true
        : ctxUser.canModerate && isPublic(meta);
    if (!isOwner && !(ctxUser.canModerate && isPublic(meta))) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    const abs = meta.path_abs
      ? meta.path_abs
      : path.isAbsolute(meta.path || "")
        ? meta.path
        : path.join(BASE_DIR, meta.path || "");
    const jsonPath = path.join(STORAGE_DIR, `${trackId}.json`);
    try {
      if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      // ignore
    }
    try {
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    } catch {
      // ignore
    }

    // Drop from all playlists
    try {
      for (const name of fs.readdirSync(PLAYLIST_DIR)) {
        if (!name.endsWith(".json")) continue;
        const full = path.join(PLAYLIST_DIR, name);
        try {
          const data = JSON.parse(fs.readFileSync(full, "utf8"));
          if (!Array.isArray(data.trackIds)) continue;
          const next = data.trackIds.filter((id) => String(id) !== trackId);
          if (next.length !== data.trackIds.length) {
            data.trackIds = next;
            data.updated_at = new Date().toISOString();
            fs.writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    res.json({
      ok: true,
      deleted: trackId,
      byModerator: !isOwner && canDeletePublic,
    });
  });

  app.patch("/api/v1/tracks/:id", async (req, res) => {
    const ctxUser = await requireLauncherUser(req, res);
    if (!ctxUser) return;
    const trackId = String(req.params.id || "").trim();
    const meta = loadTrackMeta(trackId);
    if (!meta) {
      res.status(404).json({ ok: false, error: "Track not found" });
      return;
    }
    if (!ownedBy(meta, ctxUser.ckey) && !ctxUser.canModerate) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    if (req.body?.name != null) meta.name = String(req.body.name).trim() || meta.name;
    if (req.body?.author != null) {
      meta.author = String(req.body.author).trim() || meta.author;
    }
    if (req.body?.visibility != null && ownedBy(meta, ctxUser.ckey)) {
      meta.visibility =
        String(req.body.visibility).toLowerCase() === "private"
          ? "private"
          : "public";
    }
    saveTrackMeta(meta);
    meta.display_id = deriveTrackId(meta);
    res.json({ ok: true, track: publicTrack(meta, makeBaseUrl(req)) });
  });

  app.get("/api/v1/playlist", async (req, res) => {
    const ctxUser = await requireLauncherUser(req, res);
    if (!ctxUser) return;
    const trackIds = loadPlaylist(ctxUser.ckey);
    const baseUrl = makeBaseUrl(req);
    const tracks = [];
    for (const id of trackIds) {
      const meta = loadTrackMeta(id);
      if (!meta) continue;
      meta.display_id = deriveTrackId(meta);
      tracks.push(publicTrack(meta, baseUrl));
    }
    res.json({ ok: true, ckey: ctxUser.ckey, trackIds, tracks });
  });

  app.put("/api/v1/playlist", async (req, res) => {
    const ctxUser = await requireLauncherUser(req, res);
    if (!ctxUser) return;
    const incoming = Array.isArray(req.body?.trackIds)
      ? req.body.trackIds.map(String)
      : [];
    const cleaned = [];
    const seen = new Set();
    for (const id of incoming) {
      if (seen.has(id)) continue;
      const meta = loadTrackMeta(id);
      if (!meta) continue;
      // Allow own tracks or public tracks in playlist
      if (!ownedBy(meta, ctxUser.ckey) && !isPublic(meta)) continue;
      seen.add(id);
      cleaned.push(id);
    }
    savePlaylist(ctxUser.ckey, cleaned);
    res.json({ ok: true, trackIds: cleaned });
  });

  app.get("/api/v1/file/:id", async (req, res) => {
    // Allow bearer OR legacy open for public files with optional auth
    const trackId = String(req.params.id || "").trim();
    const meta = loadTrackMeta(trackId);
    if (!meta) {
      res.status(404).send("Track not found");
      return;
    }
    const token = getBearer(req);
    if (!isPublic(meta)) {
      if (!token) {
        res.status(401).send("unauthorized");
        return;
      }
      const ctxUser = await requireLauncherUser(req, res);
      if (!ctxUser) return;
      if (!ownedBy(meta, ctxUser.ckey) && !ctxUser.canModerate) {
        res.status(403).send("forbidden");
        return;
      }
    }
    const abs = meta.path_abs
      ? meta.path_abs
      : path.isAbsolute(meta.path || "")
        ? meta.path
        : path.join(BASE_DIR, meta.path || "");
    if (!abs || !fs.existsSync(abs)) {
      res.status(404).send("File missing on disk");
      return;
    }
    res.setHeader("Content-Type", "audio/ogg");
    res.setHeader("Accept-Ranges", "bytes");
    fs.createReadStream(abs).pipe(res);
  });

  console.log("[personal-music] launcher API mounted at /api/v1/*");
}

module.exports = { attachLauncherApi };
