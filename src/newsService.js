const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

function loadNewsConfig() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "newsConfig.json"), "utf8")
  );
}

function loadLocalFeed(feedKey) {
  const file = path.join(__dirname, "news", `${feedKey}-news.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { updatedAt: null, items: [] };
  }
}

function fetchJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "OrbitalisLauncher/0.4",
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchJson(new URL(res.headers.location, url).toString(), timeoutMs)
            .then(resolve)
            .catch(reject);
          return;
        }

        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > 8_000_000) {
            req.destroy(new Error("response too large"));
          }
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

function normalizeItems(payload, maxItems) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .filter(
      (item) =>
        item &&
        (item.title ||
          item.body ||
          item.poll ||
          (Array.isArray(item.images) && item.images.length) ||
          (Array.isArray(item.reactions) && item.reactions.length) ||
          item.thread)
    )
    .slice(0, maxItems)
    .map((item, index) => ({
      id: String(item.id || `${item.date || "item"}-${index}`),
      title: item.title
        ? String(item.title)
        : item.poll?.question
          ? String(item.poll.question)
          : "",
      body: String(item.body || item.content || ""),
      date: item.date || item.publishedAt || null,
      author: item.author || item.username || null,
      url: item.url || null,
      poll: item.poll || null,
      reactions: Array.isArray(item.reactions)
        ? item.reactions
            .filter((row) => row && (row.emoji || row.count))
            .map((row) => ({
              emoji: String(row.emoji || ""),
              count: Number(row.count || 0),
              custom: Boolean(row.custom),
              id: row.id ? String(row.id) : null,
              animated: Boolean(row.animated),
              url: row.url ? String(row.url) : null,
            }))
        : [],
      images: Array.isArray(item.images)
        ? item.images
            .filter((img) => img && img.url)
            .map((img) => ({
              url: String(img.url),
              alt: img.alt ? String(img.alt) : null,
            }))
        : [],
      thread: item.thread
        ? {
            id: item.thread.id || null,
            name: item.thread.name || null,
            messageCount: Number(item.thread.messageCount || 0),
            url: item.thread.url || null,
            messages: Array.isArray(item.thread.messages)
              ? item.thread.messages.map((reply) => ({
                  id: reply.id || null,
                  author: reply.author || null,
                  body: String(reply.body || ""),
                  date: reply.date || null,
                  images: Array.isArray(reply.images)
                    ? reply.images.filter((img) => img && img.url)
                    : [],
                }))
              : [],
          }
        : null,
    }));
}

async function loadRemoteFeed(urls) {
  for (const url of urls || []) {
    try {
      const payload = await fetchJson(url);
      return { ok: true, source: url, payload };
    } catch {
      // try next
    }
  }
  return { ok: false, source: null, payload: null };
}

async function getNewsFeeds() {
  const config = loadNewsConfig();
  const maxItems = config.maxItems || 600;
  const pageSize = config.pageSize || 40;
  const result = {};

  for (const [key, feed] of Object.entries(config.feeds || {})) {
    const local = loadLocalFeed(key);
    const remote = await loadRemoteFeed(feed.urls);
    const payload = remote.ok ? remote.payload : local;
    result[key] = {
      key,
      label: feed.label || key,
      source: remote.ok ? "remote" : "local",
      sourceUrl: remote.source,
      updatedAt: payload.updatedAt || null,
      pageSize,
      items: normalizeItems(payload, maxItems),
    };
  }

  return result;
}

module.exports = {
  getNewsFeeds,
  loadNewsConfig,
};
