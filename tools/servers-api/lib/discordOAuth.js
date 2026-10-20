const https = require("https");
const { URLSearchParams } = require("url");
const { config } = require("./config");

function redirectUri() {
  return `${config.publicUrl}/auth/discord/callback`;
}

function authorizeUrl() {
  const query = new URLSearchParams({
    client_id: config.discordClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "identify",
    prompt: "consent",
  });
  return `https://discord.com/api/oauth2/authorize?${query}`;
}

function postForm(url, body) {
  const payload = new URLSearchParams(body).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
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
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function getJson(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
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
    req.on("error", reject);
    req.end();
  });
}

async function userFromCode(code) {
  const tokenRes = await postForm("https://discord.com/api/oauth2/token", {
    client_id: config.discordClientId,
    client_secret: config.discordClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  if (tokenRes.status < 200 || tokenRes.status >= 300 || !tokenRes.data?.access_token) {
    throw new Error("Discord не подтвердил вход");
  }
  const me = await getJson("https://discord.com/api/users/@me", tokenRes.data.access_token);
  if (me.status !== 200 || !me.data?.id) {
    throw new Error("Discord не отдал профиль");
  }
  const avatarUrl = me.data.avatar
    ? `https://cdn.discordapp.com/avatars/${me.data.id}/${me.data.avatar}.png`
    : "";
  return {
    id: me.data.id,
    username: me.data.username,
    globalName: me.data.global_name || me.data.username,
    avatarUrl,
  };
}

module.exports = { authorizeUrl, redirectUri, userFromCode };
