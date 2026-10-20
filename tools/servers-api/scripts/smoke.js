const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dataFile = path.join(os.tmpdir(), `orbitalis-servers-${process.pid}.json`);
process.env.SERVERS_DEV_BYPASS = "1";
process.env.SERVERS_DATA = dataFile;
process.env.PUBLIC_URL = "http://127.0.0.1:8799";
process.env.HOME_OWNER_IDS = "someone-else";
process.env.PORT = "0";

const { start } = require("../server");

function request(port, method, pathname, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data = raw;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  const server = await start(0, "127.0.0.1");
  const port = server.address().port;
  try {
    const login = await request(port, "POST", "/api/dev/login");
    assert(login.status === 200 && login.data.token === "dev", "dev login");

    const denied = await request(port, "POST", "/api/servers", {
      token: "dev",
      body: {
        name: "Orbitalis",
        host: "play.example.com",
        port: 41060,
        byondMajor: 516,
        authMode: "discord",
        background: "orbitalis",
        role: "home",
      },
    });
    assert(denied.status === 400, `home role should be rejected, got ${denied.status}`);

    const created = await request(port, "POST", "/api/servers", {
      token: "dev",
      body: {
        name: "Aurora",
        host: "play.example.com",
        port: 2506,
        byondMajor: 516,
        authMode: "discord",
        background: "plain",
        role: "guest",
      },
    });
    assert(created.status === 201 && created.data.server.token, "create server");
    const id = created.data.server.id;
    const serverToken = created.data.server.token;

    const listed = await request(port, "GET", "/api/catalog");
    assert(listed.status === 200 && listed.data.servers.length === 1, "catalog");
    assert(!listed.data.servers[0].token, "catalog leaks token");

    const status = await request(port, "POST", "/api/ingest/status", {
      body: {
        token: serverToken,
        players: 12,
        mapName: "Box",
        securityLevel: "green",
        roundId: "15",
      },
    });
    assert(status.status === 200, "status ingest");

    const live = await request(port, "GET", "/api/catalog");
    assert(live.data.servers[0].live === true, "server not live");
    assert(live.data.servers[0].status.mapName === "Box", "map missing");

    const play = await request(port, "POST", `/api/servers/${id}/play`, { token: "dev" });
    assert(play.status === 200 && play.data.ticket, "play ticket");

    const loginGame = await request(port, "POST", "/api/ingest/login", {
      body: { token: serverToken, ticket: play.data.ticket, ckey: "guest", address: "10.0.0.8" },
    });
    assert(loginGame.status === 200 && loginGame.data.discord.id === "dev-owner", "discord login");

    const again = await request(port, "POST", "/api/ingest/login", {
      body: { token: serverToken, ticket: play.data.ticket, ckey: "guest" },
    });
    assert(again.status === 404, "ticket reused");

    const pack = await request(port, "GET", `/api/servers/${id}/package`, { token: "dev" });
    assert(pack.status === 200 && String(pack.data).includes(serverToken), "package token");
    assert(String(pack.data).includes("orbitalis_bridge_login"), "package procs");

    const page = await request(port, "GET", "/");
    assert(page.status === 200 && String(page.data).includes("Серверы"), "cabinet page");

    console.log("smoke ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataFile, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
