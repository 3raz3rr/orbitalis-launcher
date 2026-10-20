const dns = require("dns");

/**
 * Static IPv4 fallbacks for flaky DNS (EAI_AGAIN on some ISPs).
 * Keep hostnames in HTTPS requests so SNI/Host stay correct.
 */
const HOST_FALLBACKS = {
  "play.hornyjail.space": "45.141.208.222",
  "auth.hornyjail.space": "89.125.60.146",
  "devassets.hornyjail.space": "89.125.60.146",
  "music.hornyjail.space": "45.141.208.222",
  "logs.hornyjail.space": "45.141.208.222",
  "proxy.hornyjail.space": "89.125.60.146",
  "prx.hornyjail.space": "89.125.60.146",
};

function fallbackFor(hostname) {
  return HOST_FALLBACKS[String(hostname || "").toLowerCase()] || null;
}

/** Custom lookup for http/https agents: IPv4 first, then known fallback. */
function lookupIpv4First(hostname, options, callback) {
  let settled = false;
  const finish = (error, address, family) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    callback(error, address, family);
  };

  const timer = setTimeout(() => {
    const fb = fallbackFor(hostname);
    if (fb) finish(null, fb, 4);
    else finish(new Error(`dns_timeout:${hostname}`));
  }, 1200);

  dns.lookup(
    hostname,
    { family: 4, all: false },
    (error, address, family) => {
      if (!error && address) {
        finish(null, address, family || 4);
        return;
      }
      const fb = fallbackFor(hostname);
      if (fb) {
        finish(null, fb, 4);
        return;
      }
      dns.lookup(hostname, options || {}, (err2, addr2, fam2) => {
        if (!err2 && addr2) {
          finish(null, addr2, fam2);
          return;
        }
        const fb2 = fallbackFor(hostname);
        if (fb2) finish(null, fb2, 4);
        else finish(err2 || error || new Error("dns_failed"));
      });
    }
  );
}

function lookupAsync(hostname, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      const fb = fallbackFor(hostname);
      if (fb) {
        finish(() => resolve({ address: fb, family: 4, fallback: true }));
      } else {
        finish(() => reject(new Error("dns_timeout")));
      }
    }, timeoutMs);

    dns.lookup(
      hostname,
      { family: 4, all: false },
      (error, address, family) => {
        if (!error && address) {
          finish(() =>
            resolve({ address, family: family || 4, fallback: false })
          );
          return;
        }
        const fb = fallbackFor(hostname);
        if (fb) {
          finish(() => resolve({ address: fb, family: 4, fallback: true }));
          return;
        }
        finish(() => reject(error || new Error("dns_failed")));
      }
    );
  });
}

module.exports = {
  HOST_FALLBACKS,
  fallbackFor,
  lookupIpv4First,
  lookupAsync,
};
