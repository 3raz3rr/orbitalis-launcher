const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { config } = require("./config");
const { getLogFullPath } = require("./fsTree");
const {
  isJsonLog,
  jsonLogEntryToLine,
  extractTs,
  extractActors,
} = require("./parsers");

const jobs = new Map();

function ensureTmpDir() {
  fs.mkdirSync(config.tmpDir, { recursive: true });
  try {
    for (const name of fs.readdirSync(config.tmpDir)) {
      if (!name.endsWith(".sorted")) continue;
      const full = path.join(config.tmpDir, name);
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs < Date.now() - 2 * 60 * 60 * 1000) {
          fs.unlinkSync(full);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function generateFromFiles(files, ownerId) {
  ensureTmpDir();
  const entries = [];
  let idx = 0;
  let totalLines = 0;
  let truncated = false;

  for (const rel of files) {
    if (truncated) break;
    const full = getLogFullPath(rel);
    if (!full) continue;
    const content = fs.readFileSync(full, "utf8");
    const json = isJsonLog(full);
    for (const raw of content.split(/\r?\n/)) {
      let line = raw;
      if (!line) continue;
      if (json) {
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
      if (/\] GAME-TOPIC:/i.test(line)) continue;
      totalLines += 1;
      if (totalLines > config.maxLogLines) {
        truncated = true;
        break;
      }
      entries.push({
        ts: extractTs(line) || "",
        idx: idx++,
        raw: line,
      });
    }
  }

  if (!entries.length) {
    return { ok: false, error: "No lines found" };
  }

  entries.sort((a, b) => {
    const c = a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    return c !== 0 ? c : a.idx - b.idx;
  });

  const jobId = crypto.randomBytes(12).toString("hex");
  const tmpFile = path.join(config.tmpDir, `${jobId}.sorted`);
  fs.writeFileSync(tmpFile, `${entries.map((e) => e.raw).join("\n")}\n`, "utf8");

  for (const [id, job] of jobs.entries()) {
    if (ownerId && job.ownerId === ownerId) {
      try {
        fs.unlinkSync(job.path);
      } catch {
        // ignore
      }
      jobs.delete(id);
    }
  }

  jobs.set(jobId, {
    path: tmpFile,
    total: entries.length,
    truncated,
    rawTotal: totalLines,
    ownerId: ownerId || null,
    createdAt: Date.now(),
  });

  return {
    ok: true,
    jobId,
    total: entries.length,
    truncated,
    rawTotal: totalLines,
    pageSize: config.linesPerPage,
    pages: Math.max(1, Math.ceil(entries.length / config.linesPerPage)),
  };
}

function readLinesPage(filePath, offset, limit) {
  const lines = [];
  const content = fs.readFileSync(filePath, "utf8");
  const all = content.split(/\r?\n/);
  if (all.length && all[all.length - 1] === "") all.pop();
  for (let i = offset; i < offset + limit && i < all.length; i++) {
    lines.push(all[i]);
  }
  return lines;
}

function viewJob(jobId, page, ownerId, { all = false } = {}) {
  const job = jobs.get(String(jobId || ""));
  if (!job || !fs.existsSync(job.path)) {
    return { ok: false, error: "No data. Generate logs first.", status: 404 };
  }
  if (ownerId && job.ownerId && job.ownerId !== ownerId) {
    return { ok: false, error: "Forbidden", status: 403 };
  }
  if (all) {
    const lines = readLinesPage(job.path, 0, job.total);
    const actors = extractActors(lines);
    return {
      ok: true,
      jobId,
      page: 1,
      pages: 1,
      total: job.total,
      truncated: job.truncated,
      rawTotal: job.rawTotal,
      pageSize: job.total,
      offset: 0,
      all: true,
      lines,
      actors,
    };
  }
  const totalPages = Math.max(1, Math.ceil(job.total / config.linesPerPage));
  const safePage = Math.max(1, Math.min(totalPages, Number(page) || 1));
  const offset = (safePage - 1) * config.linesPerPage;
  const lines = readLinesPage(job.path, offset, config.linesPerPage);
  const actors = extractActors(lines);
  return {
    ok: true,
    jobId,
    page: safePage,
    pages: totalPages,
    total: job.total,
    truncated: job.truncated,
    rawTotal: job.rawTotal,
    pageSize: config.linesPerPage,
    offset,
    lines,
    actors,
  };
}

module.exports = { generateFromFiles, viewJob, ensureTmpDir };
