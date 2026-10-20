const fs = require("fs");
const path = require("path");

function loadDotEnv(filePath) {
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(path.join(__dirname, "..", ".env"));

const ROOT = path.join(__dirname, "..");
const defaultLogsRoot = path.join(ROOT, "fixtures", "logs");

const ALLOWED_LOG_TYPES = [
  "admin",
  "attack",
  "game",
  "inventory",
  "manifest",
  "paper",
  "pda",
  "shuttle",
  "silo",
  "telecomms",
  "tool",
  "uplink",
  "virus",
];

const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",
  logsRoot: path.resolve(process.env.LOGS_ROOT || defaultLogsRoot),
  authApiUrl: (process.env.AUTH_API_URL || "https://auth.hornyjail.space").replace(
    /\/$/,
    ""
  ),
  discordGuildId: String(
    process.env.DISCORD_GUILD_ID || "1381270148664655902"
  ),
  allowedRoleIds: String(
    process.env.ALLOWED_ROLE_IDS ||
      "1428311594714136616,1428312614450106390"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  discordBotToken: process.env.DISCORD_BOT_TOKEN || "",
  discordWorkerUrl: (process.env.DISCORD_WORKER_URL || "").replace(/\/$/, ""),
  devBypass: /^(1|true|yes)$/i.test(String(process.env.LOGS_DEV_BYPASS || "")),
  linesPerPage: 3000,
  maxLogLines: 500000,
  allowedLogTypes: ALLOWED_LOG_TYPES,
  tmpDir: path.join(require("os").tmpdir(), "orbitalis-logs-api"),
};

module.exports = { config, ALLOWED_LOG_TYPES };
