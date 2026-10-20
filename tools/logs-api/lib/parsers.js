const fs = require("fs");
const path = require("path");
const { getRoot } = require("./fsTree");

const TS_REGEX = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]/;
const GHOST_CAFE_ROLES = ["ghost cafe visitor", "ghost cafe", "ghostcafe"];

function isJsonLog(filePath) {
  return /\.json$/i.test(filePath);
}

function jsonLogEntryToLine(e) {
  if (!e || !Object.prototype.hasOwnProperty.call(e, "msg") || e.msg === null) {
    return null;
  }
  let msg = e.msg;
  if (typeof msg !== "string") {
    msg = JSON.stringify(msg);
  }
  msg = msg.replace(/\r\n|\r|\n/g, " ");
  const ts = e.ts != null ? String(e.ts) : "";
  if (!ts || !ts.includes("-")) return null;
  const cat = e.cat != null ? String(e.cat).toUpperCase() : "LOG";
  return `[${ts}] ${cat}: ${msg}`;
}

function extractTs(line) {
  const m = String(line).match(TS_REGEX);
  return m ? m[1] : null;
}

function parseLogTimestamp(ts) {
  const cleaned = String(ts).replace(/(\.\d{3})\d+$/, "$1");
  const t = Date.parse(cleaned.replace(" ", "T"));
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

function readLogLinesNormalized(filePath) {
  const out = [];
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return out;
  }
  const isJson = isJsonLog(filePath);
  for (const raw of content.split(/\r?\n/)) {
    let line = raw;
    if (!line) continue;
    if (isJson) {
      if (line[0] !== "{") continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      line = jsonLogEntryToLine(e);
      if (line == null) continue;
    }
    out.push(line);
  }
  return out;
}

function roundBase(year, month, day, round) {
  const root = getRoot();
  if (!root) return null;
  const base = path.join(root, year, month, day, round);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return null;
  return base;
}

function parseRoundInfo(year, month, day, round) {
  const info = {
    manifest: [],
    antagonists: [],
    objectives: {},
    ghost_roles: [],
    duration: null,
    round_start: null,
    round_end: null,
  };
  const base = roundBase(year, month, day, round);
  if (!base) return info;

  const mjson = path.join(base, "manifest.log.json");
  if (fs.existsSync(mjson)) {
    const content = fs.readFileSync(mjson, "utf8");
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line[0] !== "{") continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (!e || !Object.prototype.hasOwnProperty.call(e, "msg") || e.msg === null) {
        continue;
      }
      const d = e.data && typeof e.data === "object" ? e.data : null;
      if (d && d.ckey != null) {
        const roles = String(d.roles || "").trim();
        info.manifest.push({
          ckey: String(d.ckey),
          name: String(d.name || ""),
          role: String(d.job || ""),
          antag:
            roles !== "" && roles.toUpperCase() !== "NONE" ? roles : "",
          latejoin: Boolean(d.latejoin),
        });
      } else {
        const parts = String(e.msg)
          .split("\\")
          .map((p) => p.trim());
        if (parts.length >= 3) {
          info.manifest.push({
            ckey: parts[0],
            name: parts[1],
            role: parts[2],
            antag:
              parts[3] && parts[3].toUpperCase() !== "NONE" ? parts[3] : "",
            latejoin: Boolean(parts[4] && /LATE/i.test(parts[4])),
          });
        }
      }
    }
  } else {
    for (const fname of ["manifest.log", "manifest.txt"]) {
      const mpath = path.join(base, fname);
      if (!fs.existsSync(mpath)) continue;
      for (const raw of fs.readFileSync(mpath, "utf8").split(/\r?\n/)) {
        let line = raw.replace(/\r$/, "");
        if (!line) continue;
        const body = line.replace(/^\[[^\]]+\]\s*/, "");
        const parts = body.split("\\").map((p) => p.trim());
        if (parts.length >= 3) {
          info.manifest.push({
            ckey: parts[0],
            name: parts[1],
            role: parts[2],
            antag:
              parts[3] && parts[3].toUpperCase() !== "NONE" ? parts[3] : "",
            latejoin: Boolean(parts[4] && /LATE/i.test(parts[4])),
          });
        }
      }
      break;
    }
  }

  let allLines = [];
  const gjson = path.join(base, "game.log.json");
  if (fs.existsSync(gjson)) {
    allLines = readLogLinesNormalized(gjson);
  } else {
    for (const fname of ["game.log", "game.txt"]) {
      const gpath = path.join(base, fname);
      if (!fs.existsSync(gpath)) continue;
      for (const raw of fs.readFileSync(gpath, "utf8").split(/\r?\n/)) {
        const line = raw.replace(/\r$/, "");
        if (!line || line === " - -------------------------") continue;
        if (TS_REGEX.test(line)) {
          allLines.push(line);
        } else if (allLines.length) {
          allLines[allLines.length - 1] += ` ${line.trimStart()}`;
        }
      }
      break;
    }
  }

  let minTs = null;
  let maxTs = null;
  const antagRe =
    /'\(([^)]+)\)'\/\(([^)]+)\)\s+has gained antag datum\s+(.+?)\(\/datum\/antagonist\/([^)]+)\)/i;
  const objRe =
    /ANTAG OBJ:\s*(\S+)\/\(([^)]*)\)\s+as\s+(.+?)\s+-\s+Objective:\s+(.+?)\s+-\s+(SUCCESS|FAIL)/i;
  const ghostRe = /became a (.+?)\.\s*\(/i;
  const ghostKeyRe = /'\(([^)]+)\)'\/\(([^)]*)\)/;

  for (const line of allLines) {
    const tsMatch = line.match(TS_REGEX);
    const lineTs = tsMatch ? tsMatch[1] : null;
    if (lineTs) {
      const parsed = parseLogTimestamp(lineTs);
      if (parsed != null) {
        if (minTs == null || parsed < minTs) minTs = parsed;
        if (maxTs == null || parsed > maxTs) maxTs = parsed;
      }
    }
    if (lineTs && /The round has ended/i.test(line)) {
      info.round_end = lineTs;
    }
    const am = line.match(antagRe);
    if (am) {
      info.antagonists.push({
        ckey: am[1],
        char: am[2],
        role: am[3].trim(),
        type: am[4],
      });
    }
    const om = line.match(objRe);
    if (om) {
      const ck = om[1].toLowerCase();
      if (!info.objectives[ck]) info.objectives[ck] = [];
      info.objectives[ck].push({
        ckey: om[1],
        char: om[2],
        antag: om[3].trim(),
        text: om[4].trim(),
        result: om[5].toUpperCase(),
      });
    }
    const gm = line.match(ghostRe);
    if (gm) {
      let roleName = gm[1].trim().replace(/^a\s+/i, "");
      let ghostCkey = "";
      let ghostName = "";
      const gkm = line.match(ghostKeyRe);
      if (gkm) {
        ghostCkey = gkm[1];
        ghostName = gkm[2];
      }
      const roleNameLower = roleName.toLowerCase();
      const isGhostCafe = GHOST_CAFE_ROLES.some((r) =>
        roleNameLower.includes(r)
      );
      if (!isGhostCafe && roleName) {
        info.ghost_roles.push({
          ckey: ghostCkey,
          name: ghostName,
          role: roleName.replace(/\b\w/g, (c) => c.toUpperCase()),
        });
      }
    }
  }

  if (minTs != null && maxTs != null && maxTs > minTs) {
    const d = maxTs - minTs;
    const h = Math.floor(d / 3600);
    const mn = Math.floor((d % 3600) / 60);
    info.duration = (h > 0 ? `${h}h ` : "") + `${mn}m`;
    if (!info.round_start) {
      info.round_start = new Date(minTs * 1000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
    }
    if (!info.round_end) {
      info.round_end = new Date(maxTs * 1000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
    }
  }

  return info;
}

function parseInventoryLog(year, month, day, round) {
  const info = {
    snapshots: {},
    events: [],
    actions: {},
    event_count: 0,
    snapshot_count: 0,
    truncated: false,
    map: null,
    z_levels: {},
    bounds: null,
  };
  const base = roundBase(year, month, day, round);
  if (!base) return info;
  const jsonPath = path.join(base, "inventory.log.json");
  if (!fs.existsSync(jsonPath)) return info;

  const maxEvents = 200000;
  let count = 0;
  for (const raw of fs.readFileSync(jsonPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] !== "{") continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry?.data || typeof entry.data !== "object") continue;
    const d = entry.data;
    const action = d.action;
    if (!action) continue;
    const ts = entry.timestamp || entry.ts || "";
    const ckey = d.ckey || "";
    const char = d.char || "";
    if (!info.map && d.map) info.map = String(d.map);

    let x = d.x != null ? Number(d.x) : null;
    let y = d.y != null ? Number(d.y) : null;
    let z = d.z != null ? Number(d.z) : null;
    const area = d.area || "";
    if ((x == null || y == null || z == null) && d.loc) {
      const m = String(d.loc).match(/\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/);
      if (m) {
        x = Number(m[1]);
        y = Number(m[2]);
        z = Number(m[3]);
      }
    }

    if (action === "ROUNDSTART" || action === "LATEJOIN" || action === "LOADOUT") {
      const items = [];
      if (Array.isArray(d.items)) {
        for (const it of d.items) {
          items.push({
            name: it.name || "?",
            type: it.type || "",
            loc_type: it.loc_type || "",
          });
        }
      }
      const key = ckey.toLowerCase() || `?${info.snapshot_count}`;
      info.snapshots[key] = {
        ckey,
        char,
        reason: action,
        loc: d.loc || "",
        area,
        x,
        y,
        z,
        timestamp: ts,
        items,
      };
      info.snapshot_count += 1;
      if (z != null) info.z_levels[z] = (info.z_levels[z] || 0) + 1;
      continue;
    }

    if (count < maxEvents) {
      info.events.push({
        timestamp: ts,
        ckey,
        char,
        action,
        item_name: d.item_name || "",
        item_type: d.item_type || "",
        slot: d.slot || "",
        container: d.container || "",
        loc: d.loc || "",
        area,
        x,
        y,
        z,
      });
      count += 1;
      if (x != null && y != null) {
        if (!info.bounds) info.bounds = [x, y, x, y];
        else {
          if (x < info.bounds[0]) info.bounds[0] = x;
          if (y < info.bounds[1]) info.bounds[1] = y;
          if (x > info.bounds[2]) info.bounds[2] = x;
          if (y > info.bounds[3]) info.bounds[3] = y;
        }
      }
      if (z != null) info.z_levels[z] = (info.z_levels[z] || 0) + 1;
    } else {
      info.truncated = true;
    }
    info.event_count += 1;
    info.actions[action] = (info.actions[action] || 0) + 1;
  }

  return info;
}

function extractActors(lines) {
  const ckeys = {};
  const names = {};
  const re = /'\(([^)]+)\)'\/\(([^)]+)\)/g;
  for (const line of lines) {
    let m;
    while ((m = re.exec(line))) {
      const ck = m[1].toLowerCase();
      const nm = m[2].toLowerCase();
      if (!ckeys[ck]) ckeys[ck] = m[1];
      if (!names[nm]) names[nm] = m[2];
    }
  }
  return {
    ckeys: Object.keys(ckeys)
      .sort()
      .map((k) => ckeys[k]),
    names: Object.keys(names)
      .sort()
      .map((k) => names[k]),
  };
}

function deptForRole(role) {
  const r = String(role || "")
    .toLowerCase()
    .trim();
  if (!r) return "other";
  const map = {
    command: [
      "captain",
      "head of personnel",
      "head of security",
      "chief engineer",
      "chief medical officer",
      "research director",
      "hop",
      "hos",
      "ce",
      "cmo",
      "rd",
      "blueshield",
      "nanotrasen",
      "centcom",
      "central command",
    ],
    security: [
      "warden",
      "detective",
      "security officer",
      "security cadet",
      "brig physician",
      "brigmedic",
    ],
    medical: [
      "medical doctor",
      "medical intern",
      "chemist",
      "paramedic",
      "virologist",
      "coroner",
    ],
    science: ["scientist", "science intern", "roboticist"],
    engineering: [
      "station engineer",
      "atmospheric technician",
      "atmos tech",
    ],
    cargo: ["quartermaster", "cargo technician", "shaft miner", "bitrunner"],
    service: [
      "bartender",
      "cook",
      "chef",
      "botanist",
      "janitor",
      "chaplain",
      "curator",
      "clown",
      "mime",
      "lawyer",
      "assistant",
    ],
    ai: ["ai", "cyborg", "personal ai"],
  };
  for (const [dept, keywords] of Object.entries(map)) {
    for (const kw of keywords) {
      if (new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "u").test(r)) {
        return dept;
      }
    }
  }
  return "other";
}

const roundInfoCache = new Map();
const inventoryCache = new Map();

function dirStamp(year, month, day, round) {
  const base = roundBase(year, month, day, round);
  if (!base) return "missing";
  let stamp = "0";
  try {
    for (const name of fs.readdirSync(base)) {
      try {
        const st = fs.statSync(path.join(base, name));
        if (st.isFile()) stamp += `:${name}:${st.mtimeMs}:${st.size}`;
      } catch {
        // ignore
      }
    }
  } catch {
    return "err";
  }
  return stamp;
}

function cachedParseRoundInfo(year, month, day, round) {
  const key = `${year}/${month}/${day}/${round}`;
  const stamp = dirStamp(year, month, day, round);
  const hit = roundInfoCache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;
  const value = parseRoundInfo(year, month, day, round);
  roundInfoCache.set(key, { stamp, value });
  return value;
}

function cachedParseInventoryLog(year, month, day, round) {
  const key = `${year}/${month}/${day}/${round}`;
  const stamp = dirStamp(year, month, day, round);
  const hit = inventoryCache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;
  const value = parseInventoryLog(year, month, day, round);
  inventoryCache.set(key, { stamp, value });
  return value;
}

module.exports = {
  TS_REGEX,
  isJsonLog,
  jsonLogEntryToLine,
  extractTs,
  readLogLinesNormalized,
  parseRoundInfo,
  parseInventoryLog,
  cachedParseRoundInfo,
  cachedParseInventoryLog,
  extractActors,
  deptForRole,
};
