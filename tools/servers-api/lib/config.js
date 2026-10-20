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

const config = {
  port: Number(process.env.PORT || 8791),
  host: process.env.HOST || "127.0.0.1",
  publicUrl: (process.env.PUBLIC_URL || "http://127.0.0.1:8791").replace(/\/$/, ""),
  authApiUrl: (process.env.AUTH_API_URL || "https://auth.hornyjail.space").replace(
    /\/$/,
    ""
  ),
  devBypass: /^(1|true|yes)$/i.test(String(process.env.SERVERS_DEV_BYPASS || "")),
  discordClientId: process.env.DISCORD_CLIENT_ID || "1052259698457464926",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || "",
  homeOwnerIds: String(process.env.HOME_OWNER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  dataFile: path.resolve(
    process.env.SERVERS_DATA || path.join(ROOT, "data", "servers.json")
  ),
  bridgeTemplate: path.join(ROOT, "bridge", "orbitalis_bridge.dm.tpl"),
  statusTtlMs: 45 * 1000,
  ticketTtlMs: 90 * 1000,
};

module.exports = { config };
