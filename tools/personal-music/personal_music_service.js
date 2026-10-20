// personal_music_service.js
// запуск: node personal_music_service.js

"use strict";

const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const app = express();

// ===================== КОНФИГ =====================

// Порт сервиса
const PORT = 8090;

// URL для формирования ссылок в ответах. Если не указан — определяется из запроса.
const PUBLIC_BASE_URL = process.env.PERSONAL_MUSIC_PUBLIC_URL || "";

// Корень репозитория (запускай node из корня репы)
const BASE_DIR = process.cwd();

// Куда временно складывать загруженные файлы
const TMP_UPLOAD_DIR = path.join(BASE_DIR, "data", "personal_music_tmp");

// Куда складывать уже сконвертированные ogg и мету
const STORAGE_DIR = path.join(BASE_DIR, "data", "personal_music_storage");

// Пути к ffmpeg и ffprobe
const FFMPEG_BIN = "/usr/bin/ffmpeg";
const FFPROBE_BIN = "/usr/bin/ffprobe";

// Время жизни одноразового кода (в миллисекундах)
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 минут

// Хранилище кодов: token -> { ckey, expiresAt }
const issuedTokens = new Map();

// Убедиться, что каталоги существуют
for (const dir of [TMP_UPLOAD_DIR, STORAGE_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Multer для multipart/form-data
const upload = multer({
  dest: TMP_UPLOAD_DIR,
  limits: {
    fileSize: 15 * 1024 * 1024, // до 15 МБ
  },
});

// ===================== СЕССИОННЫЕ КОДЫ =====================

function makeBaseUrl(req) {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  const host = req.get("host");
  if (!host) return `http://127.0.0.1:${PORT}`;

  const proto = req.protocol || "http";
  return `${proto}://${host}`;
}

function purgeExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of issuedTokens.entries()) {
    if (!data || data.expiresAt <= now) {
      issuedTokens.delete(token);
    }
  }
}

function issueTokenForCkey(rawCkey) {
  const ckey = String(rawCkey || "")
    .trim()
    .toLowerCase();

  if (!ckey) return null;

  purgeExpiredTokens();

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + TOKEN_TTL_MS;

  issuedTokens.set(token, { ckey, expiresAt });

  return { token, ckey, expiresAt };
}

function validateToken(token, expectedCkey) {
  if (!token) return null;

  purgeExpiredTokens();

  const data = issuedTokens.get(token);
  if (!data) return null;

  const now = Date.now();
  if (data.expiresAt <= now) {
    issuedTokens.delete(token);
    return null;
  }

  if (expectedCkey) {
    const normalized = String(expectedCkey || "")
      .trim()
      .toLowerCase();
    if (normalized !== data.ckey) return null;
  }

  return data;
}

// ===================== УТИЛИТЫ =====================

function makeTrackId(ckey) {
  const base =
    (ckey || "anon").replace(/[^a-z0-9]/gi, "").toLowerCase() || "anon";
  const ts = Date.now().toString(36);
  const rnd = Math.floor(Math.random() * 1e9).toString(36);
  return `HJPM-${base}-${ts}-${rnd}`;
}

function runFfmpegToOgg(srcPath, dstPath) {
  const args = [
    "-y",
    "-i",
    srcPath,
    "-vn",
    "-acodec",
    "libvorbis",
    "-qscale:a",
    "4",
    dstPath,
  ];

  const result = spawnSync(FFMPEG_BIN, args, { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(
      `ffmpeg failed with code ${result.status}: ${String(result.stderr).slice(
        -500
      )}`
    );
  }
}

function getDurationSeconds(filePath) {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ];

  const result = spawnSync(FFPROBE_BIN, args, { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(
      `ffprobe failed with code ${result.status}: ${String(result.stderr).slice(
        -500
      )}`
    );
  }

  const out = String(result.stdout || "").trim();
  const val = parseFloat(out);
  if (!isFinite(val) || val <= 0) {
    throw new Error(`ffprobe returned bad duration: "${out}"`);
  }
  return val;
}

function saveTrackMeta(meta) {
  const jsonPath = path.join(STORAGE_DIR, `${meta.id}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(meta, null, 2), "utf8");
}

function loadTrackMeta(trackId) {
  const jsonPath = path.join(STORAGE_DIR, `${trackId}.json`);
  if (!fs.existsSync(jsonPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toRelativeFromBase(absPath) {
  try {
    return path.relative(BASE_DIR, absPath).replace(/\\/g, "/");
  } catch {
    return absPath;
  }
}

function listAllMetas() {
  const files = fs.readdirSync(STORAGE_DIR).filter((f) => f.endsWith(".json"));
  const metas = [];
  for (const f of files) {
    const full = path.join(STORAGE_DIR, f);
    try {
      const raw = fs.readFileSync(full, "utf8");
      const meta = JSON.parse(raw);
      if (meta && meta.id) {
        metas.push(meta);
      }
    } catch {
      // ignore broken
    }
  }
  return metas;
}

function deriveTrackId(meta) {
  if (!meta) return "";
  const candidatePath = meta.path || meta.path_abs || meta.original_filename || meta.id || "";
  const base = path.basename(String(candidatePath), path.extname(String(candidatePath)));
  if (base) return base;
  return String(meta.id || "");
}

function safeFileNameFromMeta(meta) {
  const baseName = (meta.name || "track").replace(/[\\\/:*?"<>|]+/g, "").trim();
  const artist = (meta.author || "").replace(/[\\\/:*?"<>|]+/g, "").trim();
  let name = baseName || "track";
  if (artist) {
    name = `${artist} - ${name}`;
  }
  return `${name}.ogg`;
}

// ===================== РОУТЫ =====================

// Выдать одноразовый код загрузки
app.get("/issue_token", (req, res) => {
  const rawCkey = String(req.query.ckey || "")
    .trim()
    .toLowerCase();

  if (!rawCkey) {
    res.status(400).json({ status: "error", message: "Missing ckey" });
    return;
  }

  const session = issueTokenForCkey(rawCkey);
  if (!session) {
    res
      .status(500)
      .json({ status: "error", message: "Failed to issue token" });
    return;
  }

  const baseUrl = makeBaseUrl(req);
  const uploadUrl = `${baseUrl}/upload?ckey=${encodeURIComponent(
    session.ckey
  )}&code=${encodeURIComponent(session.token)}`;
  const libraryUrl = `${baseUrl}/library?ckey=${encodeURIComponent(
    session.ckey
  )}&code=${encodeURIComponent(session.token)}`;

  res.json({
    status: "ok",
    token: session.token,
    expires_at: new Date(session.expiresAt).toISOString(),
    expires_in: Math.round((session.expiresAt - Date.now()) / 1000),
    upload_url: uploadUrl,
    library_url: libraryUrl,
  });
});

// Красивая форма загрузки
app.get("/upload", (req, res) => {
  const ckey = String(req.query.ckey || "").trim();
  const code = String(req.query.code || "").trim();
  const session = validateToken(code, ckey);

  if (!session) {
    res
      .status(403)
      .send(
        "<p>Missing or invalid upload code. Please request a new upload link from the game.</p>"
      );
    return;
  }

  const effectiveCkey = session.ckey;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Orbitalis Personal Music</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root {
      --bg: #050713;
      --bg2: #0b0f1f;
      --panel: rgba(10, 14, 30, 0.92);
      --accent: #8b5dff;
      --accent-soft: rgba(139, 93, 255, 0.25);
      --accent-strong: #c08bff;
      --text: #f6f6ff;
      --muted: #a4a8c0;
      --danger: #ff6b7a;
      --border: rgba(255,255,255,0.06);
      --radius-lg: 18px;
      --radius-sm: 8px;
      --shadow-main: 0 18px 40px rgba(0,0,0,0.7);
      --transition-fast: 150ms ease-out;
      --transition-med: 220ms ease-out;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at 0% 0%, #18102f 0, #050713 40%, #010109 100%);
      color: var(--text);
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .shell {
      width: 100%;
      max-width: 520px;
      background: linear-gradient(145deg, var(--panel), #080a16);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-main);
      border: 1px solid var(--border);
      padding: 20px 22px 18px;
      position: relative;
      overflow: hidden;
    }

    .shell::before {
      content: "";
      position: absolute;
      inset: -40%;
      background:
        radial-gradient(circle at 0 0, rgba(139,93,255,0.12), transparent 55%),
        radial-gradient(circle at 100% 0, rgba(0,255,209,0.08), transparent 55%);
      opacity: 0.75;
      pointer-events: none;
    }

    .shell-inner {
      position: relative;
      z-index: 1;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .title-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      background: rgba(0,0,0,0.35);
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.06);
      font-size: 11px;
      color: var(--muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 12px rgba(139,93,255,0.8);
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .subtitle {
      margin: 0;
      font-size: 12px;
      color: var(--muted);
    }

    .ckey-pill {
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(0,0,0,0.45);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 11px;
      color: var(--muted);
      max-width: 190px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: right;
    }

    .ckey-pill span {
      color: var(--text);
    }

    .body-grid {
      margin-top: 10px;
      display: grid;
      gap: 12px;
    }

    label {
      font-size: 12px;
      color: var(--muted);
      display: block;
      margin-bottom: 4px;
    }

    .field {
      background: rgba(4,6,20,0.9);
      border-radius: var(--radius-sm);
      border: 1px solid rgba(255,255,255,0.06);
      padding: 8px 10px;
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
    }

    .field:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px rgba(139,93,255,0.35);
      background: rgba(7,10,26,0.95);
    }

    .field-icon {
      width: 18px;
      height: 18px;
      border-radius: 6px;
      background: radial-gradient(circle at 30% 0, var(--accent-strong), var(--accent));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #0a0813;
      flex-shrink: 0;
    }

    .field input[type="text"] {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text);
      font-size: 13px;
      padding: 2px 0;
    }

    .field input[type="text"]::placeholder {
      color: rgba(164,168,192,0.8);
    }

    .file-zone {
      position: relative;
      border-radius: var(--radius-sm);
      border: 1px dashed rgba(255,255,255,0.18);
      background: radial-gradient(circle at 0 0, var(--accent-soft), rgba(6,8,24,0.9));
      padding: 12px 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      transition: border-color var(--transition-med), background var(--transition-med), transform var(--transition-fast);
    }

    .file-zone:hover {
      border-color: var(--accent-strong);
      background: radial-gradient(circle at 0 0, rgba(139,93,255,0.3), rgba(6,8,24,0.96));
      transform: translateY(-1px);
    }

    .file-zone-main {
      flex: 1;
    }

    .file-title {
      font-size: 13px;
      font-weight: 500;
    }

    .file-sub {
      margin-top: 2px;
      font-size: 11px;
      color: var(--muted);
    }

    .file-badge {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(228,228,255,0.9);
      background: rgba(0,0,0,0.45);
      padding: 3px 7px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
    }

    .file-name {
      margin-top: 4px;
      font-size: 11px;
      color: var(--accent-strong);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-icon-wrap {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: radial-gradient(circle at 30% 0, #fff, #d3c0ff);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #201130;
      font-size: 20px;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
    }

    .file-icon-wrap::after {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 120% 120%, rgba(6,8,24,0.7), transparent 55%);
      mix-blend-mode: multiply;
      opacity: 0.9;
    }

    .file-icon-inner {
      position: relative;
      z-index: 1;
    }

    input[type="file"] {
      display: none;
    }

    .footer-row {
      margin-top: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }

    .hint-text {
      font-size: 11px;
      color: var(--muted);
      max-width: 70%;
    }

    .hint-text b {
      color: var(--accent-strong);
    }

    .btn-submit {
      border: none;
      border-radius: 999px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 550;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      color: #050713;
      background: linear-gradient(135deg, var(--accent), #47ffd0);
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.08),
        0 12px 26px rgba(0,0,0,0.75);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: transform var(--transition-fast), box-shadow var(--transition-fast), filter var(--transition-fast);
      white-space: nowrap;
    }

    .btn-submit span.icon {
      font-size: 14px;
    }

    .btn-submit:hover {
      transform: translateY(-1px);
      filter: brightness(1.05);
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.1),
        0 16px 30px rgba(0,0,0,0.85);
    }

    .btn-submit:active {
      transform: translateY(0);
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.12),
        0 8px 18px rgba(0,0,0,0.8);
    }

    .divider {
      margin: 10px 0 8px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .small-note {
      font-size: 10px;
      color: rgba(164,168,192,0.85);
      text-align: right;
    }

    .small-note a {
      color: #c08bff;
      text-decoration: none;
      margin-left: 6px;
      font-size: 11px;
    }

    .small-note a:hover {
      text-decoration: underline;
    }

    @media (max-width: 480px) {
      .shell {
        padding: 16px 14px 14px;
      }
      .footer-row {
        flex-direction: column-reverse;
        align-items: stretch;
      }
      .hint-text {
        max-width: 100%;
      }
      .btn-submit {
        justify-content: center;
        width: 100%;
      }
      .ckey-pill {
        max-width: 50%;
      }
      .small-note {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="shell-inner">
      <div class="title-row">
        <div class="title-main">
          <div class="badge">
            <span class="badge-dot"></span>
            PERSONAL TRACK UPLOAD
          </div>
          <h1>Orbitalis PDA Player</h1>
          <p class="subtitle">
            Upload a personal track and link it in your in-game PDA.
          </p>
        </div>
        <div class="ckey-pill">
          Ckey: <span>${effectiveCkey || "unknown"}</span>
        </div>
      </div>

      <form method="POST"
            action="/upload?ckey=${encodeURIComponent(effectiveCkey)}&code=${encodeURIComponent(
    code
  )}"
            enctype="multipart/form-data"
            id="uploadForm">

        <div class="body-grid">
          <div>
            <label for="track_name">Track name</label>
            <div class="field">
              <div class="field-icon">♪</div>
              <input type="text"
                     id="track_name"
                     name="track_name"
                     placeholder="Station Blues, Space Jazz, etc.">
            </div>
          </div>

          <div>
            <label for="track_author">Artist</label>
            <div class="field">
              <div class="field-icon">★</div>
              <input type="text"
                     id="track_author"
                     name="track_author"
                     placeholder="Your nickname or artist name">
            </div>
          </div>

          <div>
            <label>Audio file</label>
            <label class="file-zone" for="track_file">
              <div class="file-icon-wrap">
                <div class="file-icon-inner">♪</div>
              </div>
              <div class="file-zone-main">
                <div class="file-title">Drop file here or click to select</div>
                <div class="file-sub">
                  Supported: OGG, MP3 • up to ~15&nbsp;MB
                </div>
                <div class="file-name" id="fileName">
                  No file selected
                </div>
              </div>
              <div class="file-badge">Audio Only</div>
            </label>
            <input type="file"
                   id="track_file"
                   name="track"
                   accept=".ogg,.mp3,audio/*"
                   required>
          </div>
        </div>

        <div class="divider"></div>

        <div class="footer-row">
          <div class="hint-text">
            After upload you'll get a track ID like <b>HJPM-...-...-...</b>.<br>
            Your PDA can auto-sync all tracks for this ckey.
          </div>
          <button type="submit" class="btn-submit">
            <span class="icon">▲</span>
            <span>Upload track</span>
          </button>
        </div>

        <div class="small-note">
          The track is stored only on the server and used in-game for your PDA headphones.
          <a href="/library?ckey=${encodeURIComponent(
            effectiveCkey
          )}&code=${encodeURIComponent(code)}">Open your track library →</a>
        </div>
      </form>
    </div>
  </div>

  <script>
    (function() {
      const fileInput = document.getElementById("track_file");
      const fileNameEl = document.getElementById("fileName");
      const zone = document.querySelector(".file-zone");

      if (!fileInput || !fileNameEl || !zone) return;

      fileInput.addEventListener("change", function() {
        const f = this.files && this.files[0];
        if (f) {
          fileNameEl.textContent = f.name;
        } else {
          fileNameEl.textContent = "No file selected";
        }
      });

      zone.addEventListener("dragover", function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.style.borderColor = "#c08bff";
      });

      zone.addEventListener("dragleave", function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.style.borderColor = "rgba(255,255,255,0.18)";
      });

      zone.addEventListener("drop", function(e) {
        e.preventDefault();
        e.stopPropagation();
        zone.style.borderColor = "rgba(255,255,255,0.18)";
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          fileInput.files = e.dataTransfer.files;
          const f = e.dataTransfer.files[0];
          fileNameEl.textContent = f.name;
        }
      });
    })();
  </script>
</body>
</html>`);
});

// Приём файла и конвертация
app.post("/upload", upload.single("track"), (req, res) => {
  (async () => {
    const ckey = String(req.query.ckey || "").trim();
    const code = String(req.query.code || "").trim();
    const session = validateToken(code, ckey);
    const file = req.file;

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    if (!session) {
      if (file && file.path) {
        try {
          fs.unlinkSync(file.path);
        } catch {}
      }
      res
        .status(403)
        .send(
          "<p>Missing or invalid upload code. Please request a new upload link from the game.</p>"
        );
      return;
    }

    if (!file) {
      res.status(400).send("<p>No file uploaded.</p>");
      return;
    }

    const effectiveCkey = session.ckey;
    const origName = file.originalname || "track";
    const trackName = String(req.body.track_name || "").trim() || origName;
    const trackAuthor =
      String(req.body.track_author || "").trim() || "Unknown artist";

    try {
      const trackId = makeTrackId(effectiveCkey);

      const tmpPath = file.path;
      const finalOggPath = path.join(STORAGE_DIR, `${trackId}.ogg`);

      // Конвертация
      runFfmpegToOgg(tmpPath, finalOggPath);

      // Длительность
      const durationSeconds = getDurationSeconds(finalOggPath);
      const durationDs = Math.round(durationSeconds * 10);

      // Размер
      const sizeBytes = fs.statSync(finalOggPath).size;

      // Метаданные
      const meta = {
        id: trackId,
        ckey: effectiveCkey,
        name: trackName,
        author: trackAuthor,
        path_abs: finalOggPath,
        path: toRelativeFromBase(finalOggPath),
        duration_seconds: durationSeconds,
        duration_ds: durationDs,
        size_bytes: sizeBytes,
        codec: "vorbis",
        format: "ogg",
        created_at: new Date().toISOString(),
        original_filename: origName,
      };

      saveTrackMeta(meta);

      // Чистим временный файл
      try {
        fs.unlinkSync(tmpPath);
      } catch {}

      res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Track uploaded</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root {
      --bg: #050713;
      --panel: rgba(10,14,30,0.96);
      --accent: #8b5dff;
      --accent2: #47ffd0;
      --text: #f6f6ff;
      --muted: #a4a8c0;
      --border: rgba(255,255,255,0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 18px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at 0% 0%, #18102f 0, #050713 40%, #010109 100%);
      color: var(--text);
    }
    .card {
      width: 100%;
      max-width: 520px;
      background: var(--panel);
      border-radius: 18px;
      border: 1px solid var(--border);
      box-shadow: 0 20px 44px rgba(0,0,0,0.82);
      padding: 18px 20px 16px;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: -40%;
      background:
        radial-gradient(circle at 0 0, rgba(71,255,208,0.15), transparent 55%),
        radial-gradient(circle at 100% 0, rgba(139,93,255,0.18), transparent 60%);
      opacity: 0.85;
      pointer-events: none;
    }
    .card-inner {
      position: relative;
      z-index: 1;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(0,0,0,0.5);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9fffd7;
      margin-bottom: 6px;
    }
    .tag-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4effcb;
      box-shadow: 0 0 14px rgba(78,255,203,0.85);
    }
    h2 {
      margin: 0 0 8px;
      font-size: 19px;
    }
    p {
      margin: 4px 0;
      font-size: 13px;
      color: var(--muted);
    }
    .info-grid {
      margin-top: 10px;
      padding: 10px 10px;
      border-radius: 14px;
      background: rgba(4,7,20,0.95);
      border: 1px solid rgba(255,255,255,0.12);
      display: grid;
      gap: 6px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
    }
    .row-label {
      color: var(--muted);
    }
    .row-value {
      font-weight: 500;
      text-align: right;
    }
    .id-box {
      margin-top: 8px;
      padding: 8px 10px;
      border-radius: 12px;
      background: rgba(0,0,0,0.55);
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255,255,255,0.16);
    }
    .id-label {
      font-size: 12px;
      color: var(--muted);
    }
    .id-value {
      flex: 1;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      padding: 4px 8px;
      border-radius: 8px;
      background: rgba(5,7,20,0.9);
      border: 1px solid rgba(255,255,255,0.12);
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
    .btn-copy {
      border: none;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #050713;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 10px 20px rgba(0,0,0,0.85);
    }
    .actions {
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .actions p {
      font-size: 11px;
      margin: 0;
    }
    .btn-link {
      border: none;
      background: transparent;
      color: #c08bff;
      font-size: 12px;
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
    }
    @media (max-width: 480px) {
      .card {
        padding: 16px 14px 14px;
      }
      .row {
        flex-direction: column;
        align-items: flex-start;
      }
      .row-value {
        text-align: left;
      }
      .actions {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-inner">
      <div class="tag">
        <span class="tag-dot"></span>
        Track uploaded
      </div>
      <h2>Personal track prepared</h2>
      <p>
        Your audio has been converted to OGG/Vorbis and stored on the server.
        Your PDA can auto-sync this track by ckey.
      </p>

      <div class="info-grid">
        <div class="row">
          <div class="row-label">Track name</div>
          <div class="row-value">${trackName}</div>
        </div>
        <div class="row">
          <div class="row-label">Artist</div>
          <div class="row-value">${trackAuthor}</div>
        </div>
        <div class="row">
          <div class="row-label">Duration</div>
          <div class="row-value">~${durationSeconds.toFixed(1)} s</div>
        </div>
        <div class="row">
          <div class="row-label">File size</div>
          <div class="row-value">${(sizeBytes / (1024 * 1024)).toFixed(
            2
          )} MB</div>
        </div>
        <div class="row">
          <div class="row-label">Ckey</div>
          <div class="row-value">${effectiveCkey}</div>
        </div>
      </div>

      <div class="id-box">
        <div>
          <div class="id-label">Track ID (for PDA &quot;Link by ID&quot;)</div>
          <div class="id-value" id="trackId">${trackId}</div>
        </div>
        <button class="btn-copy" type="button" onclick="copyId()">
          <span>Copy</span>
        </button>
      </div>

      <div class="actions">
        <p>
          In game, open your PDA music program — it can auto-sync all tracks for this ckey.<br>
          Or use <b>&quot;Link by ID&quot;</b> and paste the value above.
        </p>
        <div>
          <button class="btn-link" type="button" onclick="location.href='/upload?ckey=${encodeURIComponent(
            effectiveCkey
          )}&code=${encodeURIComponent(code)}'">
            ← Upload another track
          </button>
          <button class="btn-link" type="button" onclick="location.href='/library?ckey=${encodeURIComponent(
            effectiveCkey
          )}&code=${encodeURIComponent(code)}'">
            Open library →
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    function copyId() {
      var el = document.getElementById("trackId");
      if (!el) return;
      var text = el.textContent.trim();
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function(){});
      } else {
        var tmp = document.createElement("textarea");
        tmp.value = text;
        document.body.appendChild(tmp);
        tmp.select();
        try { document.execCommand("copy"); } catch(e) {}
        document.body.removeChild(tmp);
      }
    }
  </script>
</body>
</html>`);
    } catch (err) {
      console.error("Upload failed:", err);
      res
        .status(500)
        .send(
          `<p>Processing failed: ${String(
            err && err.message ? err.message : err
          )}</p>`
        );
    }
  })();
});

// Инфо по ID для BYOND (для add_track_from_service)
app.get("/info", (req, res) => {
  const trackId = String(req.query.track_id || "").trim();
  if (!trackId) {
    res.status(400).json({
      status: "error",
      message: "Missing track_id",
    });
    return;
  }

  const meta = loadTrackMeta(trackId);
  if (!meta) {
    res.status(404).json({
      status: "error",
      message: `Track not found: ${trackId}`,
    });
    return;
  }

  res.json({
    status: "ok",
    id: meta.id,
    name: meta.name,
    author: meta.author,
    path: meta.path, // относительный путь для BYOND
    duration_ds: meta.duration_ds,
    size_bytes: meta.size_bytes,
    codec: meta.codec,
    format: meta.format,
  });
});

// JSON-список треков пользователя для игры/поиска
app.get("/list", (req, res) => {
  const query = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const code = String(req.query.code || "").trim();
  let ckey = String(req.query.ckey || "")
    .trim()
    .toLowerCase();

  let session = null;
  if (code) {
    session = validateToken(code, ckey || undefined);
    if (!session) {
      res.status(403).json({
        status: "error",
        message: "Invalid or expired code",
      });
      return;
    }
    ckey = session.ckey;
  }

  if (!ckey) {
    res.status(400).json({
      status: "error",
      message: "Missing ckey",
    });
    return;
  }

  const metas = listAllMetas().filter((m) => {
    const mCkey = String(m.ckey || "").toLowerCase();
    if (mCkey !== ckey) return false;
    if (!query) return true;
    const name = String(m.name || "").toLowerCase();
    const author = String(m.author || "").toLowerCase();
    return name.includes(query) || author.includes(query);
  });

  res.json({
    status: "ok",
    ckey,
    tracks: metas.map((m) => ({
      id: m.id,
      display_id: deriveTrackId(m),
      name: m.name,
      author: m.author,
      duration_ds: m.duration_ds,
      size_bytes: m.size_bytes,
      created_at: m.created_at,
    })),
  });
});

// Отдача файла по ID
app.get("/file/:id", (req, res) => {
  const trackId = String(req.params.id || "").trim();
  if (!trackId) {
    res.status(400).send("Missing id");
    return;
  }

  const meta = loadTrackMeta(trackId);
  if (!meta || !meta.path) {
    res.status(404).send("Track not found");
    return;
  }

  const abs = path.isAbsolute(meta.path)
    ? meta.path
    : path.join(BASE_DIR, meta.path);
  if (!fs.existsSync(abs)) {
    res.status(404).send("File missing on disk");
    return;
  }

  const filename = safeFileNameFromMeta(meta);

  res.setHeader("Content-Type", "audio/ogg");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/"/g, "")}"`
  );

  const stream = fs.createReadStream(abs);
  stream.on("error", () => {
    res.status(500).end();
  });
  stream.pipe(res);
});

// Страница библиотеки с поиском и скачиванием
app.get("/library", (req, res) => {
  const ckey = String(req.query.ckey || "").trim();
  const code = String(req.query.code || "").trim();
  const session = validateToken(code, ckey);

  if (!session) {
    res
      .status(403)
      .send(
        "<p>Missing or invalid access code. Please request a new library link from the game.</p>"
      );
    return;
  }

  const effectiveCkey = session.ckey;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Orbitalis Music Library</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root {
      --bg: #050713;
      --panel: rgba(10,14,30,0.96);
      --accent: #8b5dff;
      --accent2: #47ffd0;
      --text: #f6f6ff;
      --muted: #a4a8c0;
      --border: rgba(255,255,255,0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at 0% 0%, #18102f 0, #050713 40%, #010109 100%);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .wrap {
      width: 100%;
      max-width: 780px;
    }
    .card {
      width: 100%;
      background: var(--panel);
      border-radius: 18px;
      border: 1px solid var(--border);
      box-shadow: 0 20px 44px rgba(0,0,0,0.82);
      padding: 18px 20px 16px;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: -40%;
      background:
        radial-gradient(circle at 0 0, rgba(71,255,208,0.16), transparent 55%),
        radial-gradient(circle at 100% 0, rgba(139,93,255,0.21), transparent 60%);
      opacity: 0.9;
      pointer-events: none;
    }
    .card-inner {
      position: relative;
      z-index: 1;
    }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
    }
    .sub {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--muted);
    }
    .ckey-pill {
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(0,0,0,0.45);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 11px;
      color: var(--muted);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      align-self: flex-start;
    }
    .ckey-pill span {
      color: var(--text);
    }
    .search-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .search-input-wrap {
      flex: 1;
      min-width: 0;
    }
    .search-input {
      width: 100%;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      padding: 7px 12px;
      font-size: 13px;
      background: rgba(4,7,20,0.96);
      color: var(--text);
      outline: none;
    }
    .search-input::placeholder {
      color: var(--muted);
    }
    .btn-small {
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.18);
      padding: 7px 12px;
      font-size: 12px;
      background: rgba(0,0,0,0.45);
      color: #c08bff;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-small:hover {
      border-color: #c08bff;
    }
    .list {
      margin-top: 8px;
      max-height: 420px;
      overflow: auto;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(4,7,20,0.96);
    }
    .item {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) 70px minmax(0, 1.6fr) 90px;
      gap: 10px;
      padding: 8px 10px;
      font-size: 12px;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .item:nth-child(odd) {
      background: rgba(8,12,30,0.6);
    }
    .item:last-child {
      border-bottom: none;
    }
    .item-main {
      font-weight: 500;
    }
    .item-artist {
      color: var(--muted);
    }
    .item-dur {
      text-align: right;
      color: var(--muted);
    }
    .item-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text);
    }
    .item-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }
    .btn-download {
      border-radius: 999px;
      border: none;
      padding: 5px 10px;
      font-size: 11px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #050713;
      cursor: pointer;
      white-space: nowrap;
    }
    .empty {
      padding: 10px;
      font-size: 12px;
      color: var(--muted);
      text-align: center;
    }
    .footer-note {
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .footer-note a {
      color: #c08bff;
      text-decoration: none;
    }
    .footer-note a:hover {
      text-decoration: underline;
    }
    @media (max-width: 720px) {
      .item {
        grid-template-columns: minmax(0, 2fr) minmax(0, 2fr);
        grid-template-rows: auto auto auto;
      }
      .item-main, .item-artist, .item-dur, .item-id, .item-actions {
        text-align: left;
      }
      .item-dur, .item-id {
        font-size: 11px;
      }
      .item-actions {
        justify-content: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="card-inner">
        <div class="header">
          <div>
            <h1>Music Library</h1>
            <p class="sub">All tracks uploaded for this ckey.</p>
          </div>
          <div class="ckey-pill">
            Ckey: <span id="ckeyLabel">${effectiveCkey || "unknown"}</span>
          </div>
        </div>

        <div class="search-row">
          <div class="search-input-wrap">
            <input id="searchInput" class="search-input" type="text"
                   placeholder="Search by track name or artist...">
          </div>
          <button class="btn-small" type="button" id="reloadBtn">Reload</button>
        </div>

        <div id="list" class="list">
          <div class="empty">Loading tracks...</div>
        </div>

        <div class="footer-note">
          <div>
            Tracks are stored on the server and used in-game by PDA player.
          </div>
          <div>
            <a href="/upload?ckey=${encodeURIComponent(
              effectiveCkey
            )}&code=${encodeURIComponent(code)}">← Back to upload</a>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function(){
      const ckey = ${JSON.stringify(effectiveCkey || "")};
      const code = ${JSON.stringify(code)};
      const listEl = document.getElementById("list");
      const searchInput = document.getElementById("searchInput");
      const reloadBtn = document.getElementById("reloadBtn");
      let tracks = [];

      function fmtDuration(ds) {
        if (!ds || ds <= 0) return "–";
        const sec = Math.round(ds / 10);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m.toString().padStart(2, "0") + ":" + s.toString().padStart(2, "0");
      }

      function render() {
        const q = (searchInput.value || "").toLowerCase().trim();
        let filtered = tracks;
        if (q) {
          filtered = tracks.filter(t => {
            const name = (t.name || "").toLowerCase();
            const author = (t.author || "").toLowerCase();
            return name.includes(q) || author.includes(q);
          });
        }

        if (!filtered.length) {
          listEl.innerHTML = '<div class="empty">No tracks found for this ckey.</div>';
          return;
        }

        const rows = filtered.map(t => {
          const dur = fmtDuration(t.duration_ds);
          const id = t.display_id || t.id || '';
          return (
            '<div class="item">' +
              '<div class="item-main">' + (t.name || "Untitled track") + '</div>' +
              '<div class="item-artist">' + (t.author || "Unknown artist") + '</div>' +
              '<div class="item-dur">' + dur + '</div>' +
              '<div class="item-id">' + id + '</div>' +
              '<div class="item-actions">' +
                '<button class="btn-download" type="button" onclick="location.href=\'/file/' + encodeURIComponent(t.id) + '\'">Download</button>' +
              '</div>' +
            '</div>'
          );
        }).join("");

        listEl.innerHTML = rows;
      }

      function load() {
        if (!ckey) {
          listEl.innerHTML = '<div class="empty">No ckey provided. Open this page from the game or from upload page.</div>';
          return;
        }
        listEl.innerHTML = '<div class="empty">Loading tracks...</div>';
        const params = new URLSearchParams();
        params.set('ckey', ckey);
        params.set('code', code || '');
        fetch('/list?' + params.toString())
          .then(r => {
            if (!r.ok) {
              throw new Error('HTTP ' + r.status);
            }
            return r.json();
          })
          .then(data => {
            if (!data || data.status !== "ok") {
              listEl.innerHTML = '<div class="empty">Failed to load tracks.</div>';
              return;
            }
            tracks = data.tracks || [];
            render();
          })
          .catch(() => {
            listEl.innerHTML = '<div class="empty">Failed to load tracks.</div>';
          });
      }

      searchInput.addEventListener("input", function() {
        render();
      });

      reloadBtn.addEventListener("click", function(){
        load();
      });

      load();
    })();
  </script>
</body>
</html>`);
});

// Заглушка raw-эндпоинта (на всякий случай)
app.post("/personal_music_raw", (req, res) => {
  res.status(501).json({
    status: "error",
    message: "RAW endpoint not used in this setup",
  });
});

// Launcher JSON API (Discord Bearer → ckey)
try {
  const { attachLauncherApi } = require("./launcher_api");
  attachLauncherApi(app, {
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
  });
} catch (error) {
  console.error("[personal-music] launcher API failed to mount:", error);
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Personal music service listening on http://127.0.0.1:${PORT}`);
});
