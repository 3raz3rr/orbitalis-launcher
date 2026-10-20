const { execFile } = require("child_process");

const POLL_MS = 2000;
const LAUNCH_GRACE_MS = 12000;

let session = {
  running: false,
  launching: false,
  pids: [],
  startedAt: null,
  launchUntil: 0,
  serverId: null,
  game: null,
  label: null,
};

let timer = null;
let onChange = null;
let lastSignature = "";

function snapshot() {
  const pids = Array.isArray(session.pids) ? session.pids : [];
  const running = pids.length > 0;
  const launching = Boolean(session.launching) && !running;
  return {
    running,
    launching,
    pids,
    count: pids.length,
    startedAt: running || launching ? session.startedAt : null,
    serverId: session.serverId,
    game: session.game,
    label: session.label,
  };
}

function signatureOf(snap) {
  return JSON.stringify({
    running: snap.running,
    launching: snap.launching,
    pids: snap.pids,
    serverId: snap.serverId,
    game: snap.game,
  });
}

function emitIfChanged() {
  const snap = snapshot();
  const next = signatureOf(snap);
  if (next === lastSignature) {
    return snap;
  }
  lastSignature = next;
  if (typeof onChange === "function") {
    onChange(snap);
  }
  return snap;
}

function parseTasklistCsv(raw) {
  const text = String(raw || "");
  if (/INFO:/i.test(text) && !/dreamseeker\.exe/i.test(text)) {
    return [];
  }
  const pids = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/dreamseeker\.exe["'\s,;]+"?(\d+)/i);
    if (match) {
      pids.push(Number(match[1]));
    }
  }
  return pids;
}

function listDreamseekerPids() {
  if (process.platform !== "win32") {
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/FI", "IMAGENAME eq dreamseeker.exe", "/FO", "CSV", "/NH"],
      { windowsHide: true, timeout: 4000, encoding: "utf8" },
      (error, stdout) => {
        if (error && !stdout) {
          resolve([]);
          return;
        }
        resolve(parseTasklistCsv(stdout));
      }
    );
  });
}

function psEncoded(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function focusDreamseeker() {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: "not_windows" });
  }
  const script = [
    "$procs = @(Get-Process -Name dreamseeker -ErrorAction SilentlyContinue)",
    "if (-not $procs.Count) { exit 2 }",
    'Add-Type -TypeDefinition @"',
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class OrbitalisWin {",
    '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);',
    "}",
    '"@',
    "foreach ($p in $procs) {",
    "  $h = $p.MainWindowHandle",
    "  if ($h -eq [IntPtr]::Zero) { continue }",
    "  if ([OrbitalisWin]::IsIconic($h)) { [void][OrbitalisWin]::ShowWindowAsync($h, 9) }",
    "  [void][OrbitalisWin]::SetForegroundWindow($h)",
    "  exit 0",
    "}",
    "exit 3",
    "",
  ].join("\r\n");

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        psEncoded(script),
      ],
      { windowsHide: true, timeout: 8000 },
      (error, _stdout, stderr) => {
        const code = Number(error?.code);
        if (!error) {
          resolve({ ok: true });
          return;
        }
        if (code === 2) {
          resolve({ ok: false, error: "not_running" });
          return;
        }
        resolve({
          ok: false,
          error: String(stderr || error.message || "focus_failed").trim(),
        });
      }
    );
  });
}

async function poll() {
  const pids = await listDreamseekerPids();
  const now = Date.now();
  session.pids = pids;
  session.running = pids.length > 0;

  if (session.running) {
    session.launching = false;
    session.launchUntil = 0;
    if (!session.startedAt) {
      session.startedAt = now;
    }
  } else if (session.launching && now > session.launchUntil) {
    session.launching = false;
    session.launchUntil = 0;
    session.startedAt = null;
    session.serverId = null;
    session.game = null;
    session.label = null;
  } else if (!session.launching) {
    session.startedAt = null;
    session.serverId = null;
    session.game = null;
    session.label = null;
  }

  return emitIfChanged();
}

function markLaunched({ serverId, game, label } = {}) {
  const now = Date.now();
  session.launching = true;
  session.launchUntil = now + LAUNCH_GRACE_MS;
  session.startedAt = session.startedAt || now;
  session.serverId = serverId || session.serverId;
  session.game = game || session.game;
  session.label = label || session.label;
  emitIfChanged();
  poll();
}

function rememberTarget({ serverId, game, label } = {}) {
  if (serverId) session.serverId = serverId;
  if (game) session.game = game;
  if (label) session.label = label;
}

function startWatch(handler) {
  onChange = handler;
  if (timer) {
    clearInterval(timer);
  }
  poll();
  timer = setInterval(() => {
    poll();
  }, POLL_MS);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

function stopWatch() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function getSession() {
  return snapshot();
}

module.exports = {
  startWatch,
  stopWatch,
  getSession,
  poll,
  markLaunched,
  rememberTarget,
  listDreamseekerPids,
  focusDreamseeker,
};
