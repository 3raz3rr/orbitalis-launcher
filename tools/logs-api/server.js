const http = require("http");
const { URL } = require("url");
const { config } = require("./lib/config");
const { resolveStaff } = require("./lib/auth");
const { buildTree, getLogsForRound } = require("./lib/fsTree");
const { cachedParseRoundInfo, cachedParseInventoryLog, deptForRole } = require("./lib/parsers");
const { generateFromFiles, viewJob, ensureTmpDir } = require("./lib/generate");

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function requireStaff(req, res) {
  const token = getBearer(req);
  if (!token) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return null;
  }
  let result;
  try {
    result = await resolveStaff(token);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: error?.message ? error.message : String(error),
    });
    return null;
  }
  if (result.expired) {
    sendJson(res, 401, { ok: false, error: "session_expired" });
    return null;
  }
  if (!result.ok) {
    sendJson(res, 401, { ok: false, error: result.error || "unauthorized" });
    return null;
  }
  if (!result.staff) {
    sendJson(res, 403, {
      ok: false,
      error: "forbidden",
      staff: false,
      user: result.user || null,
    });
    return null;
  }
  return result;
}

function enrichManifest(roundInfo) {
  if (!roundInfo?.manifest) return roundInfo;
  return {
    ...roundInfo,
    manifest: roundInfo.manifest.map((row) => ({
      ...row,
      dept: deptForRole(row.role),
    })),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      });
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "GET" && (pathname === "/" || pathname === "/health")) {
      sendJson(res, 200, {
        ok: true,
        service: "orbitalis-logs-api",
        logsRoot: config.logsRoot,
        devBypass: config.devBypass,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/me") {
      const token = getBearer(req);
      if (!token) {
        sendJson(res, 401, { ok: false, error: "unauthorized" });
        return;
      }
      const result = await resolveStaff(token);
      if (result.expired) {
        sendJson(res, 401, { ok: false, error: "session_expired" });
        return;
      }
      if (!result.ok) {
        sendJson(res, 401, { ok: false, error: result.error || "unauthorized" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        staff: Boolean(result.staff),
        user: result.user,
        bypass: Boolean(result.bypass),
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/tree") {
      const auth = await requireStaff(req, res);
      if (!auth) return;
      const tree = buildTree({
        year: url.searchParams.get("year") || undefined,
        month: url.searchParams.get("month") || undefined,
        day: url.searchParams.get("day") || undefined,
        round: url.searchParams.get("round") || undefined,
      });
      sendJson(res, 200, { ok: true, ...tree });
      return;
    }

    if (req.method === "GET" && pathname === "/api/round") {
      const auth = await requireStaff(req, res);
      if (!auth) return;
      const year = url.searchParams.get("year");
      const month = url.searchParams.get("month");
      const day = url.searchParams.get("day");
      const round = url.searchParams.get("round");
      if (!year || !month || !day || !round) {
        sendJson(res, 400, { ok: false, error: "year, month, day, round required" });
        return;
      }
      const fields = String(url.searchParams.get("fields") || "files,meta")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const wantFiles = fields.includes("files") || fields.includes("all");
      const wantMeta = fields.includes("meta") || fields.includes("all");
      const wantInventory = fields.includes("inventory") || fields.includes("all");

      const payload = { ok: true, year, month, day, round, fields };
      if (wantFiles) {
        payload.files = getLogsForRound(year, month, day, round);
      }
      if (wantMeta) {
        payload.roundInfo = enrichManifest(
          cachedParseRoundInfo(year, month, day, round)
        );
      }
      if (wantInventory) {
        const inventory = cachedParseInventoryLog(year, month, day, round);
        payload.inventory = {
          snapshot_count: inventory.snapshot_count,
          event_count: inventory.event_count,
          truncated: inventory.truncated,
          map: inventory.map,
          actions: inventory.actions,
          snapshots: inventory.snapshots,
          events: inventory.events.slice(0, 2000),
          events_omitted: Math.max(0, inventory.events.length - 2000),
        };
      }
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === "POST" && pathname === "/api/generate") {
      const auth = await requireStaff(req, res);
      if (!auth) return;
      let body;
      try {
        body = await readBody(req);
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid_json" });
        return;
      }
      const files = Array.isArray(body?.files) ? body.files.map(String) : [];
      if (!files.length) {
        sendJson(res, 400, { ok: false, error: "No files selected" });
        return;
      }
      const result = generateFromFiles(files, auth.user?.id || null);
      if (!result.ok) {
        sendJson(res, 400, result);
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && pathname === "/api/view") {
      const auth = await requireStaff(req, res);
      if (!auth) return;
      const jobId = url.searchParams.get("jobId");
      const page = url.searchParams.get("page") || "1";
      const all = /^(1|true|yes)$/i.test(String(url.searchParams.get("all") || ""));
      const result = viewJob(jobId, page, auth.user?.id || null, { all });
      if (!result.ok) {
        sendJson(res, result.status || 400, result);
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error?.message ? error.message : String(error),
    });
  }
});

ensureTmpDir();
server.listen(config.port, config.host, () => {
  console.log(
    `[logs-api] http://${config.host}:${config.port} root=${config.logsRoot} bypass=${config.devBypass}`
  );
});
