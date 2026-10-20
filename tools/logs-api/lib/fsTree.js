const fs = require("fs");
const path = require("path");
const { config, ALLOWED_LOG_TYPES } = require("./config");

function getRoot() {
  const root = path.resolve(config.logsRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return null;
  }
  return fs.realpathSync(root);
}

function listNumericDirs(dir, pattern) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!pattern.test(name)) continue;
    try {
      if (fs.statSync(full).isDirectory()) out.push(name);
    } catch {
      // ignore
    }
  }
  out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return out;
}

function listYears() {
  const root = getRoot();
  if (!root) return [];
  return listNumericDirs(root, /^\d{4}$/);
}

function listMonths(year) {
  const root = getRoot();
  if (!root) return [];
  return listNumericDirs(path.join(root, year), /^\d{2}$/);
}

function listDays(year, month) {
  const root = getRoot();
  if (!root) return [];
  return listNumericDirs(path.join(root, year, month), /^\d{2}$/);
}

function listRounds(year, month, day) {
  const root = getRoot();
  if (!root) return [];
  const dir = path.join(root, year, month, day);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    if (name.toLowerCase().startsWith("round")) out.push(name);
  }
  out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return out;
}

function getLogsForRound(year, month, day, round) {
  const root = getRoot();
  if (!root) return [];
  const dir = path.join(root, year, month, day, round);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      if (!fs.statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    if (!/\.(log|txt)(\.json)?$/i.test(name)) continue;
    let stem = name.toLowerCase().replace(/\.json$/i, "");
    stem = stem.replace(/\.(log|txt)$/i, "");
    let allowed = false;
    for (const type of ALLOWED_LOG_TYPES) {
      if (
        stem === type ||
        stem.startsWith(`${type}_`) ||
        stem.startsWith(`${type}.`)
      ) {
        allowed = true;
        break;
      }
    }
    if (!allowed) continue;
    const rel = path
      .relative(root, full)
      .split(path.sep)
      .join("/");
    const label = name.replace(/\.json$/i, "");
    out.push({ rel, label });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

function getLogFullPath(rel) {
  const root = getRoot();
  if (!root) return null;
  const cleaned = String(rel || "")
    .replace(/\.\./g, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const full = path.join(root, ...cleaned.split("/").filter(Boolean));
  let real;
  try {
    real = fs.realpathSync(full);
  } catch {
    return null;
  }
  const rootReal = root;
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
    return null;
  }
  if (!fs.statSync(real).isFile()) return null;
  return real;
}

function buildTree({ year, month, day, round } = {}) {
  const years = listYears();
  const y = year && years.includes(year) ? year : years[0] || null;
  const months = y ? listMonths(y) : [];
  const m = month && months.includes(month) ? month : months[0] || null;
  const days = y && m ? listDays(y, m) : [];
  const d = day && days.includes(day) ? day : days[0] || null;
  const rounds = y && m && d ? listRounds(y, m, d) : [];
  const r = round && rounds.includes(round) ? round : rounds[0] || null;
  const files = y && m && d && r ? getLogsForRound(y, m, d, r) : [];
  return {
    years,
    year: y,
    months,
    month: m,
    days,
    day: d,
    rounds,
    round: r,
    files,
  };
}

module.exports = {
  getRoot,
  listYears,
  listMonths,
  listDays,
  listRounds,
  getLogsForRound,
  getLogFullPath,
  buildTree,
};
