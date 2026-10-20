const net = require("net");

/** Minimal BYOND Topic packet (same layout as auth-server). */
function buildTopicPacket(topicQuery) {
  const topic = topicQuery[0] === "?" ? topicQuery : `?${topicQuery}`;
  const topicBuf = Buffer.from(topic, "utf8");
  const packet = Buffer.alloc(2 + 2 + 5 + topicBuf.length + 1);
  packet[0] = 0x00;
  packet[1] = 0x83;
  packet.writeUInt16BE(5 + topicBuf.length + 1, 2);
  topicBuf.copy(packet, 9);
  packet[9 + topicBuf.length] = 0x00;
  return packet;
}

function decodeTopicPayload(buf) {
  if (!buf || buf.length < 5 || buf[0] !== 0x00 || buf[1] !== 0x83) {
    return null;
  }
  const size = buf.readUInt16BE(2);
  if (buf.length < 4 + size) {
    return null;
  }
  const type = buf[4];
  if (type === 0x06) {
    const end = buf.indexOf(0, 5);
    const stop = end === -1 ? Math.min(buf.length, 4 + size) : end;
    return buf.slice(5, stop).toString("utf8");
  }
  if (type === 0x2a && buf.length >= 9) {
    return buf.readFloatLE(5);
  }
  return null;
}

function topicRequest(ip, port, topicQuery, timeoutMs = 2000) {
  const packet = buildTopicPacket(topicQuery);
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let settled = false;

    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      if (!ok) {
        resolve(null);
        return;
      }
      resolve(decodeTopicPayload(buf));
    };

    socket.setTimeout(timeoutMs);
    socket.connect({ host: ip, port, family: 4 }, () => {
      socket.write(packet);
    });
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= 5 && buf[0] === 0x00 && buf[1] === 0x83) {
        const size = buf.readUInt16BE(2);
        if (buf.length >= 4 + size) {
          finish(true);
        }
      }
    });
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("close", () => {
      if (!settled && buf.length >= 5) {
        finish(true);
      } else {
        finish(false);
      }
    });
  });
}

/**
 * Measure round-trip to DreamDaemon via Topic (not bare TCP accept).
 * Uses anonymous JSON ping when available, else legacy status.
 */
function topicRttMs(ip, port, timeoutMs = 1500) {
  const packet = buildTopicPacket("ping");

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let settled = false;
    const started = process.hrtime.bigint();

    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      if (!ok) {
        resolve(null);
        return;
      }
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      resolve(Math.max(1, Math.round(ms)));
    };

    socket.setTimeout(timeoutMs);
    socket.connect({ host: ip, port, family: 4 }, () => {
      socket.write(packet);
    });
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= 5 && buf[0] === 0x00 && buf[1] === 0x83) {
        const size = buf.readUInt16BE(2);
        if (buf.length >= 4 + size) {
          finish(true);
        }
      }
    });
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("close", () => {
      if (!settled && buf.length >= 5) {
        finish(true);
      } else {
        finish(false);
      }
    });
  });
}

function parseByondParams(raw) {
  const out = {};
  for (const part of String(raw || "").split("&")) {
    if (!part) {
      continue;
    }
    const eq = part.indexOf("=");
    const key = eq >= 0 ? part.slice(0, eq) : part;
    const val = eq >= 0 ? part.slice(eq + 1) : "";
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(
        val.replace(/\+/g, " ")
      );
    } catch {
      out[key] = val;
    }
  }
  return out;
}

module.exports = {
  topicRttMs,
  buildTopicPacket,
  topicRequest,
  parseByondParams,
};
