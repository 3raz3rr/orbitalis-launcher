const state = {
  servers: {},
  links: {},
  prefs: {},
  probes: {},
  feeds: {},
  activeFeed: "dev",
  newsShown: {},
  selectedId: "mainDirect",
  recommendedId: "mainDirect",
  probing: false,
  view: "home",
  byondInstalled: false,
  byondPath: null,
  byondVersion: null,
  byondPatched: false,
  status: null,
  auth: {
    configured: false,
    user: null,
  },
};

const els = {
  byondBtn: document.getElementById("open-byond"),
  heroTagline: document.getElementById("hero-tagline"),
  playMain: document.getElementById("play-main"),
  playLabel: document.getElementById("play-label"),
  playSub: document.getElementById("play-sub"),
  lastLine: document.getElementById("last-line"),
  routeNote: document.getElementById("route-note"),
  routeDropdown: document.getElementById("route-dropdown"),
  routeTrigger: document.getElementById("route-trigger"),
  routeTriggerDot: document.getElementById("route-trigger-dot"),
  routeTriggerName: document.getElementById("route-trigger-name"),
  routeTriggerMs: document.getElementById("route-trigger-ms"),
  routeMenu: document.getElementById("route-menu"),
  newsList: document.getElementById("news-list"),
  toast: document.getElementById("toast"),
  updateProgress: document.getElementById("update-progress"),
  updateProgressBar: document.getElementById("update-progress-bar"),
  updateProgressPct: document.getElementById("update-progress-pct"),
  version: document.getElementById("version"),
  vtLink: document.getElementById("open-virustotal"),
  refresh: document.getElementById("refresh-probes"),
  authLogin: document.getElementById("auth-login"),
  authLogout: document.getElementById("auth-logout"),
  authUser: document.getElementById("auth-user"),
  authAvatar: document.getElementById("auth-avatar"),
  authName: document.getElementById("auth-name"),
  authOpenAccount: document.getElementById("auth-open-account"),
  viewHome: document.getElementById("view-home"),
  viewNews: document.getElementById("view-news"),
  viewAccount: document.getElementById("view-account"),
  accountBody: document.getElementById("account-body"),
  navNewsBadge: document.getElementById("nav-news-badge"),
  statusLine: document.getElementById("status-line"),
  statusKind: document.getElementById("status-kind"),
  statusPlayers: document.getElementById("status-players"),
  statusPlaying: document.getElementById("status-playing"),
  statusSecurity: document.getElementById("status-security"),
  statusMap: document.getElementById("status-map"),
  statusRound: document.getElementById("status-round"),
  statusStory: document.getElementById("status-story"),
  statusNote: document.getElementById("status-note"),
};

function toast(message, isError = false) {
  els.toast.hidden = !message;
  els.toast.textContent = message || "";
  els.toast.classList.toggle("error", Boolean(isError));
}

function setUpdateProgress(percent, visible) {
  if (!els.updateProgress) {
    return;
  }
  const show = Boolean(visible);
  els.updateProgress.hidden = !show;
  if (!show) {
    return;
  }
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  if (els.updateProgressBar) {
    els.updateProgressBar.style.width = `${pct}%`;
  }
  if (els.updateProgressPct) {
    els.updateProgressPct.textContent = `${pct}%`;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMs(probe) {
  if (!probe) {
    return "…";
  }
  if (!probe.ok) {
    return "offline";
  }
  return `${probe.ms} ms`;
}

function formatNewsDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roundDurationToSeconds(value) {
  // BYOND reports round duration in deciseconds (1s = 10 ticks).
  // The status API forwards that raw value, so normalize to seconds here.
  return (Math.max(0, Number(value) || 0)) / 10;
}

function formatDuration(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) {
    return `${h}ч ${m}м`;
  }
  return `${m}м`;
}

function formatHours(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (mins < 60) {
    return `${mins}м`;
  }
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${h}ч ${rem}м` : `${h}ч`;
}

function formatBanExpiry(expires, permanent) {
  if (permanent || !expires) {
    return "∞";
  }
  return formatDateTime(expires);
}

function cleanNewsTitle(text) {
  return String(text || "")
    .replace(/^#+\s*/, "")
    .replace(/^\*\*(.+)\*\*$/s, "$1")
    .replace(/^__(.+)__$/s, "$1")
    .trim();
}

function titlesMatch(a, b) {
  const left = cleanNewsTitle(a).toLowerCase().replace(/\s+/g, " ");
  const right = cleanNewsTitle(b).toLowerCase().replace(/\s+/g, " ");
  return Boolean(left) && left === right;
}

function twemojiUrl(emoji) {
  const points = [];
  for (const char of String(emoji || "")) {
    const cp = char.codePointAt(0);
    if (cp == null) continue;
    // skip variation selectors
    if (cp === 0xfe0f || cp === 0xfe0e) continue;
    points.push(cp.toString(16));
  }
  if (!points.length) {
    return null;
  }
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${points.join(
    "-"
  )}.png`;
}

function formatInlineMarkdown(text) {
  let html = escapeHtml(text || "");
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return html;
}

function isDiscordChannelUrl(url) {
  return /discord(?:app)?\.com\/channels\//i.test(String(url || ""));
}

function openLauncherLink(url) {
  if (!url) {
    return;
  }
  if (isDiscordChannelUrl(url) && window.launcher.openDiscord) {
    window.launcher.openDiscord(url);
    return;
  }
  window.launcher.openExternal(url);
}

function statusKindFromSelection() {
  const server = state.servers[state.selectedId];
  return server?.kind === "dev" ? "dev" : "main";
}

function setDot(id, probe) {
  document.querySelectorAll(`[data-dot="${id}"]`).forEach((dot) => {
    dot.classList.remove("online", "offline", "pending");
    if (!probe || state.probing) {
      dot.classList.add("pending");
      return;
    }
    dot.classList.add(probe.ok ? "online" : "offline");
  });
  const msEl = document.getElementById(`ms-${id}`);
  if (msEl) {
    msEl.textContent = state.probing ? "…" : formatMs(probe);
  }
}

function renderStatus() {
  const kind = statusKindFromSelection();
  const kindLabel = kind === "dev" ? "DEV" : "основной";
  if (els.statusKind) {
    els.statusKind.textContent = kindLabel;
  }
  const kindBadgeEl = document.getElementById("status-kind-badge");
  if (kindBadgeEl) {
    kindBadgeEl.textContent = kindLabel;
    kindBadgeEl.classList.toggle("is-dev", kind === "dev");
    kindBadgeEl.classList.toggle("is-main", kind !== "dev");
  }

  const setLine = (html) => {
    if (els.statusLine) {
      els.statusLine.innerHTML = html;
    }
  };

  const payload = state.status;
  if (!payload) {
    setLine("Загрузка статуса…");
    return;
  }

  if (!payload.ok || !payload.status) {
    setLine(
      payload.error
        ? `Статус недоступен: ${escapeHtml(payload.error)}`
        : "Статус недоступен"
    );
    return;
  }

  const s = payload.status;
  const players = String(s.players ?? 0);
  const playing = String(s.playing ?? 0);
  const sec = String(s.securityLevel || "unknown").toLowerCase();
  const map = s.mapName || "-";
  const roundParts = [];
  if (s.roundId != null && s.roundId !== "") {
    roundParts.push(`#${s.roundId}`);
  }
  if (s.roundDurationSec != null) {
    roundParts.push(formatDuration(roundDurationToSeconds(s.roundDurationSec)));
  }
  const round = roundParts.length ? roundParts.join(" · ") : "-";
  const story = s.storyteller || "-";

  const cell = (label, value, valueClass = "") =>
    `<div class="stat">
      <span class="stat-k">${escapeHtml(label)}</span>
      <span class="stat-v${valueClass ? ` ${valueClass}` : ""}">${value}</span>
    </div>`;

  const closedBadge =
    s.enter === false
      ? `<span class="status-closed-badge">вход закрыт</span>`
      : "";

  const cells = [
    cell("Онлайн", escapeHtml(players)),
    cell("На станции", escapeHtml(playing)),
    cell(
      "Уровень угрозы",
      `<span class="sec-${escapeHtml(sec)}">${escapeHtml(sec)}</span>`
    ),
    cell("Карта", escapeHtml(map)),
    cell("Раунд", escapeHtml(round)),
    cell("Сторителлер", escapeHtml(story)),
  ];

  setLine(
    `<div class="status-strip">${cells.join("")}${closedBadge}</div>`
  );
}

function syncSelectionUI() {
  document.querySelectorAll("[data-server]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.server === state.selectedId);
  });

  const selOption = document.querySelector(
    `#route-menu [data-server="${state.selectedId}"]`
  );
  if (selOption) {
    if (els.routeTriggerName) {
      els.routeTriggerName.textContent =
        selOption.querySelector(".route-opt-name")?.textContent || "";
    }
    if (els.routeTriggerMs) {
      els.routeTriggerMs.textContent =
        selOption.querySelector(".route-ms")?.textContent || "-";
    }
    if (els.routeTriggerDot) {
      const selDot = selOption.querySelector("[data-dot]");
      els.routeTriggerDot.className = selDot ? selDot.className : "route-dot";
    }
  }

  const server = state.servers[state.selectedId];
  const probe = state.probes[state.selectedId];
  if (!server) {
    return;
  }

  const isRecommended = state.selectedId === state.recommendedId;
  els.playLabel.textContent = "Присоединиться";
  let playSub;
  if (probe?.ok) {
    playSub = `${probe.ms} ms${isRecommended ? " · рекомендовано" : ""}`;
  } else if (probe && !probe.ok) {
    playSub = "маршрут недоступен";
  } else {
    playSub = "проверка маршрута…";
  }
  els.playSub.textContent = playSub;

  const direct = state.probes.mainDirect;
  const proxy = state.probes.mainProxy;
  if (els.routeNote && direct && proxy) {
    let note = "";
    if (!direct.ok && proxy.ok) {
      note = "Прямой маршрут сейчас недоступен. Используй прокси.";
    } else if (direct.ok && !proxy.ok) {
      note = "Прокси недоступен. Для обычной игры бери прямой вход.";
    } else if (direct.ok && proxy.ok) {
      note =
        direct.ms + 25 < proxy.ms
          ? "Прямой заметно быстрее. Прокси - запасной путь."
          : "";
    } else {
      note = "Оба маршрута не ответили. Обнови статус или проверь сеть.";
    }
    els.routeNote.textContent = note;
    els.routeNote.hidden = !note;
  }

  renderStatus();
}

function formatMarkdown(text) {
  let html = escapeHtml(text || "");

  // fenced code
  html = html.replace(/```([\s\S]*?)```/g, (_m, code) => {
    return `<pre class="md-pre"><code>${code.trim()}</code></pre>`;
  });

  // Discord headings: ## big, # section (smaller), ### mid
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="md-h md-h-lg">$1</h2>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="md-h md-h-md">$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h3 class="md-h md-h-sm">$1</h3>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4 class="md-h md-h-sm">$1</h4>');

  // Discord small text (-# ...)
  html = html.replace(/^-#\s+(.+)$/gm, '<p class="md-small">$1</p>');

  // horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="md-hr" />');

  // bold / italic / strike / inline code - single-line only (** is bold, not a heading)
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  html = html.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

  // markdown links then bare urls
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_m, label, url) => {
      const kind = isDiscordChannelUrl(url) ? "discord" : "ext";
      return `<a class="md-link" href="${url}" data-${kind}="${url}">${label}</a>`;
    }
  );
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (_m, prefix, url) => {
    const kind = isDiscordChannelUrl(url) ? "discord" : "ext";
    return `${prefix}<a class="md-link" href="${url}" data-${kind}="${url}">${url}</a>`;
  });

  // unordered lists: - * • ·
  html = html.replace(/(?:^(?:[-*•·])\s+.+(?:\n|$))+?/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((line) => line.replace(/^[-*•·]\s+/, "").trim())
      .filter(Boolean)
      .map((line) => `<li>${line}</li>`)
      .join("");
    return `<ul class="md-list">${items}</ul>\n`;
  });

  // numbered lists
  html = html.replace(/(?:^(?:\d+[.)])\s+.+(?:\n|$))+?/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((line) => line.replace(/^\d+[.)]\s+/, "").trim())
      .filter(Boolean)
      .map((line) => `<li>${line}</li>`)
      .join("");
    return `<ol class="md-list">${items}</ol>\n`;
  });

  // paragraphs / breaks for remaining text
  html = html
    .split(/\n{2,}/)
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) {
        return "";
      }
      if (
        /^<(h[2-6]|ul|ol|pre|hr|p)\b/i.test(trimmed) ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol")
      ) {
        return trimmed;
      }
      return `<p class="md-p">${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return html;
}

function renderReactionsHtml(reactions) {
  if (!Array.isArray(reactions) || !reactions.length) {
    return "";
  }
  return `<div class="news-reactions">${reactions
    .map((row) => {
      const label = escapeHtml(row.emoji || "");
      const url = row.url || (!row.custom ? twemojiUrl(row.emoji) : null);
      const icon = url
        ? `<img class="news-reaction-img" src="${escapeHtml(
            url
          )}" alt="${label}" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="news-reaction-emoji">${label}</span>`;
      return `<span class="news-reaction" title="${label}">${icon}<span class="news-reaction-count">${escapeHtml(
        String(row.count || 0)
      )}</span></span>`;
    })
    .join("")}</div>`;
}

function renderNewsImages(images) {
  if (!Array.isArray(images) || !images.length) {
    return "";
  }
  return `<div class="news-images">${images
    .map((img) => {
      const alt = escapeHtml(img.alt || "");
      const url = escapeHtml(img.url);
      return `<button type="button" class="news-image" data-lightbox="${url}" title="${alt}">
        <img src="${url}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" />
      </button>`;
    })
    .join("")}</div>`;
}

function openLightbox(url) {
  if (!url) {
    return;
  }
  let overlay = document.getElementById("lightbox");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "lightbox";
    overlay.className = "lightbox";
    overlay.hidden = true;
    overlay.innerHTML =
      '<button type="button" class="lightbox-close" aria-label="Закрыть">×</button><img alt="" />';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (
        event.target === overlay ||
        event.target.classList.contains("lightbox-close")
      ) {
        overlay.hidden = true;
        overlay.querySelector("img").removeAttribute("src");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) {
        overlay.hidden = true;
        overlay.querySelector("img").removeAttribute("src");
      }
    });
  }
  overlay.querySelector("img").src = url;
  overlay.hidden = false;
}

function renderThreadHtml(thread) {
  if (!thread) {
    return "";
  }
  const replies = Array.isArray(thread.messages) ? thread.messages : [];
  const count = Number(thread.messageCount || replies.length || 0);
  const namePart = thread.name
    ? `Тред: ${thread.name}`
    : count > 0
      ? `Обсуждение`
      : "Обсуждение в треде";
  const countPart = count > 0 ? ` · ${count}` : "";
  const label = `${namePart}${countPart}`;

  const replyHtml = replies.length
    ? `<div class="news-thread-replies">${replies
        .map((reply) => {
          const meta = [reply.author, formatNewsDate(reply.date)]
            .filter(Boolean)
            .join(" · ");
          return `<article class="news-thread-reply">
            ${meta ? `<span class="news-meta">${escapeHtml(meta)}</span>` : ""}
            <div class="news-body">${
              reply.body ? formatMarkdown(reply.body) : ""
            }</div>
            ${renderNewsImages(reply.images)}
          </article>`;
        })
        .join("")}</div>`
    : `<p class="panel-note">В треде есть обсуждение - открой в Discord.</p>`;

  return `<details class="news-thread">
    <summary class="news-thread-head">${escapeHtml(label)}</summary>
    <div class="news-thread-body">${replyHtml}</div>
  </details>`;
}

function renderPollHtml(poll, options = {}) {
  if (!poll) {
    return "";
  }
  const hideQuestion = Boolean(options.hideQuestion);
  const total = Number(poll.totalVotes) || 0;
  const answers = Array.isArray(poll.answers) ? poll.answers : [];
  const optionsHtml = answers
    .map((answer) => {
      const votes = answer.votes == null ? null : Number(answer.votes);
      const pct =
        votes != null && total > 0 ? Math.round((votes / total) * 100) : null;
      const meta =
        votes == null
          ? ""
          : `<span class="poll-meta">${votes}${
              pct != null ? ` · ${pct}%` : ""
            }</span>`;
      const width = pct != null ? Math.max(4, pct) : 0;
      const icon = answer.emojiUrl
        ? `<img class="poll-emoji" src="${escapeHtml(
            answer.emojiUrl
          )}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : "";
      const winner = answer.winner ? " is-winner" : "";
      return `<div class="poll-option${winner}">
        <div class="poll-bar" style="width:${width}%"></div>
        <div class="poll-row">
          <span class="poll-label">${icon}${escapeHtml(answer.text || "")}</span>
          ${meta}
        </div>
      </div>`;
    })
    .join("");

  const foot = [
    total > 0 ? `${total} голосов` : null,
    poll.resultSummary
      ? "итог"
      : poll.finalized
        ? "завершён"
        : "активен",
  ]
    .filter(Boolean)
    .join(" · ");

  return `<div class="poll-card">
    ${
      hideQuestion
        ? ""
        : `<strong class="poll-q">${escapeHtml(poll.question || "Опрос")}</strong>`
    }
    ${optionsHtml}
    ${foot ? `<span class="poll-foot">${escapeHtml(foot)}</span>` : ""}
  </div>`;
}

function getNewsItemsChronological(feed) {
  const items = Array.isArray(feed?.items) ? feed.items : [];
  // Discord API / sync store newest-first; show oldest → newest like the channel.
  return [...items].reverse();
}

function renderNews(options = {}) {
  const preserveScroll = Boolean(options.preserveScroll);
  const feed = state.feeds[state.activeFeed];
  document.querySelectorAll(".news-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.feed === state.activeFeed);
  });

  if (!feed) {
    els.newsList.innerHTML =
      '<p class="panel-note">Новости ещё не загружены.</p>';
    return;
  }

  if (!feed.items?.length) {
    els.newsList.innerHTML =
      '<p class="panel-note">Пока пусто. Загляни позже.</p>';
    return;
  }

  const pageSize = Number(feed.pageSize) || 15;
  const chronological = getNewsItemsChronological(feed);
  const total = chronological.length;
  const shown = Math.min(
    Math.max(Number(state.newsShown[state.activeFeed]) || pageSize, pageSize),
    total
  );
  state.newsShown[state.activeFeed] = shown;

  const list = els.newsList;
  const prevHeight = list.scrollHeight;
  const prevTop = list.scrollTop;

  // Window of the newest `shown` posts (older ones load upward via "ещё").
  const visible = chronological.slice(-shown);

  list.innerHTML = "";
  markFeedRead(state.activeFeed);

  if (shown < total) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "news-more";
    more.textContent = `Показать более ранние (${shown} из ${total})`;
    more.addEventListener("click", () => {
      state.newsShown[state.activeFeed] = Math.min(shown + pageSize, total);
      renderNews({ preserveScroll: true });
    });
    list.appendChild(more);
  } else if (total > pageSize) {
    const done = document.createElement("p");
    done.className = "panel-note news-more-done";
    done.textContent = `Все ${total} записей · сверху старые, снизу новые`;
    list.appendChild(done);
  }

  visible.forEach((item) => {
    const node = document.createElement("article");
    node.className = "news-item";

    const meta = [formatNewsDate(item.date), item.author]
      .filter(Boolean)
      .join(" · ");

    const rawTitle = cleanNewsTitle(item.title);
    const showTitle = Boolean(rawTitle);
    const hidePollQuestion =
      Boolean(item.poll?.question) &&
      (!showTitle || titlesMatch(rawTitle, item.poll.question));
    const titleHtml = showTitle
      ? `<div class="news-title">${formatInlineMarkdown(rawTitle)}</div>`
      : item.poll?.question
        ? `<div class="news-title">${formatInlineMarkdown(item.poll.question)}</div>`
        : "";
    const bodyHtml = item.body ? formatMarkdown(item.body) : "";
    const pollHtml = renderPollHtml(item.poll, {
      hideQuestion: hidePollQuestion || Boolean(item.poll?.question && titleHtml),
    });
    const reactionsHtml = renderReactionsHtml(item.reactions);
    const imagesHtml = renderNewsImages(item.images);
    const threadHtml = renderThreadHtml(item.thread);

    node.innerHTML = `
      ${titleHtml}
      ${meta ? `<span class="news-meta">${escapeHtml(meta)}</span>` : ""}
      <div class="news-body">${bodyHtml}</div>
      ${imagesHtml}
      ${pollHtml}
      ${reactionsHtml}
      ${threadHtml}
    `;

    node.querySelectorAll("a[data-ext], button[data-ext]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openLauncherLink(link.getAttribute("data-ext"));
      });
    });
    node.querySelectorAll("a[data-discord]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openLauncherLink(link.getAttribute("data-discord"));
      });
    });
    node.querySelectorAll("button[data-lightbox]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        openLightbox(btn.getAttribute("data-lightbox"));
      });
    });

    if (item.url || item.thread?.url) {
      const actions = document.createElement("div");
      actions.className = "news-actions";
      if (item.url) {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "news-link";
        link.textContent = "Открыть в Discord";
        link.addEventListener("click", () => openLauncherLink(item.url));
        actions.appendChild(link);
      }
      if (item.thread?.url) {
        const threadLink = document.createElement("button");
        threadLink.type = "button";
        threadLink.className = "news-link";
        threadLink.textContent = "Тред в Discord";
        threadLink.addEventListener("click", () =>
          openLauncherLink(item.thread.url)
        );
        actions.appendChild(threadLink);
      }
      node.appendChild(actions);
    }

    list.appendChild(node);
  });

  if (preserveScroll) {
    list.scrollTop = list.scrollHeight - prevHeight + prevTop;
  } else {
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }
}

function renderAuth() {
  const user = state.auth.user;
  const authBox = document.getElementById("auth-box");
  if (!state.auth.configured) {
    if (authBox) authBox.hidden = true;
    els.authLogin.hidden = true;
    els.authUser.hidden = true;
    return;
  }
  if (authBox) authBox.hidden = false;
  if (user) {
    els.authLogin.hidden = true;
    els.authUser.hidden = false;
    const name = user.globalName || user.username || "Discord";
    els.authName.textContent = name;
    els.authOpenAccount.title = user.inGuild
      ? `${name} · на сервере Discord`
      : `${name} · не на сервере Discord`;
    if (user.avatarUrl) {
      els.authAvatar.src = user.avatarUrl;
      els.authAvatar.hidden = false;
    } else {
      els.authAvatar.removeAttribute("src");
      els.authAvatar.hidden = true;
    }
  } else {
    els.authLogin.hidden = false;
    els.authUser.hidden = true;
  }
}

function renderLastLine() {
  const lastId = state.prefs.lastServerId;
  if (!lastId || !state.servers[lastId]) {
    els.lastLine.textContent = "";
    return;
  }
  const when = state.prefs.lastConnectedAt
    ? new Date(state.prefs.lastConnectedAt).toLocaleString()
    : "";
  els.lastLine.textContent = `Последний вход: ${state.servers[lastId].label}${
    when ? ` · ${when}` : ""
  }`;
}

function setView(view) {
  state.view = view;
  document.body.classList.toggle("on-account", view === "account");
  if (els.viewHome) {
    els.viewHome.hidden = view !== "home";
  }
  if (els.viewNews) {
    els.viewNews.hidden = view !== "news";
  }
  if (els.viewAccount) {
    els.viewAccount.hidden = view !== "account";
  }
  document.querySelectorAll(".menu_button[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  if (view === "news") {
    markFeedRead(state.activeFeed);
    if (els.newsList) {
      requestAnimationFrame(() => {
        els.newsList.scrollTop = els.newsList.scrollHeight;
      });
    }
  }
}

function initParallax() {
  const nebulaEl = document.getElementById("parallax-nebula");
  const starsSmallEl = document.getElementById("parallax-stars-small");
  const starsBigEl = document.getElementById("parallax-stars-big");
  if (!nebulaEl || !starsSmallEl || !starsBigEl) {
    return;
  }
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  document.addEventListener("mousemove", (event) => {
    const w = window.innerWidth || document.documentElement.clientWidth;
    const h = window.innerHeight || document.documentElement.clientHeight;
    targetX = (event.clientX / w - 0.5) * 2;
    targetY = (event.clientY / h - 0.5) * 2;
  });
  const animate = () => {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    nebulaEl.style.left = `${currentX * 15 - 50}px`;
    nebulaEl.style.top = `${currentY * 15 - 50}px`;
    starsSmallEl.style.left = `${currentX * 30 - 50}px`;
    starsSmallEl.style.top = `${currentY * 30 - 50}px`;
    starsBigEl.style.left = `${currentX * 50 - 50}px`;
    starsBigEl.style.top = `${currentY * 50 - 50}px`;
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function renderAccountLoading() {
  els.accountBody.innerHTML =
    '<p class="panel-note">Загрузка карточки игрока…</p>';
}

function renderAccountPlaceholder() {
  els.accountBody.innerHTML =
    '<p class="panel-note">Войди через Discord, чтобы увидеть карточку.</p>';
}

function renderAccountError(message) {
  els.accountBody.innerHTML = `<p class="panel-note">${escapeHtml(
    message || "Не удалось загрузить данные"
  )}</p>`;
}

function tipAttr(text) {
  return ` title="${escapeHtml(text)}" data-tip="${escapeHtml(text)}"`;
}

function colorSwatch(hex, label) {
  if (!hex) {
    return "";
  }
  const value = String(hex).startsWith("#") ? String(hex) : `#${hex}`;
  return `<span class="swatch" style="background:${escapeHtml(value)}"${tipAttr(
    label || value
  )}></span>`;
}

function renderHoursTable(rows) {
  if (!rows.length) {
    return '<p class="panel-note">Нет данных.</p>';
  }
  return `<table class="acct-table">
    <tbody>
      ${rows
        .map(
          (row) => `<tr>
          <td>${escapeHtml(row.job)}</td>
          <td class="num">${escapeHtml(formatHours(row.minutes))}</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderAccountCard(data) {
  const user = data.user || state.auth.user || {};
  const name = user.globalName || user.username || "Discord";
  const avatar = user.avatarUrl
    ? `<img class="account-avatar" src="${escapeHtml(user.avatarUrl)}" alt="" />`
    : "";

  if (!data.linked || !data.player) {
    els.accountBody.innerHTML = `
      <div class="account-layout">
        <div class="account-top">
          <div class="account-card identity">
            <div class="account-row">
              ${avatar}
              <div class="account-meta">
                <strong>${escapeHtml(name)}</strong>
                <span>${escapeHtml(user.username || "")}</span>
              </div>
            </div>
          </div>
          <div class="account-card">
            <h3>Игровая карта</h3>
            <p class="panel-note">Discord не привязан к ckey. Привяжи аккаунт в игре.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const player = data.player;
  const info = player.player || {};
  const jobPlaytimes = player.playtimes || [];
  const specialPlaytimes = player.specialPlaytimes || [];
  const totalPlaytimes =
    player.totalPlaytimes ||
    [
      { job: "Admin", minutes: player.adminMinutes || 0 },
      { job: "Living", minutes: player.livingMinutes || 0 },
      { job: "Ghost", minutes: player.ghostMinutes || 0 },
    ].filter((row) => row.minutes > 0);
  const characters = player.characters || [];
  const notes = player.notes || [];
  const bans = player.bans || [];
  const living = player.livingMinutes ?? player.totalMinutes ?? 0;
  const status = player.status || {
    kind: player.banned ? "banned" : "active",
    label: player.banned ? "Заблокирован" : "Активен",
    expires: null,
    permanent: false,
  };
  const statusClass =
    status.kind === "banned"
      ? "badge-bad"
      : status.kind === "partial"
        ? "badge-warn"
        : "badge-ok";
  const statusDetail =
    status.kind === "active"
      ? "Активных блокировок нет"
      : status.kind === "partial"
        ? `Джоббан · до ${formatBanExpiry(status.expires, status.permanent)}`
        : `До ${formatBanExpiry(status.expires, status.permanent)}`;
  const statusTip =
    status.kind === "active"
      ? "Активных банов нет (истёкшие и снятые не считаются)"
      : status.kind === "partial"
        ? "Есть джоббан - полная блокировка входа нет"
        : "Активный серверный бан";

  const charRows =
    characters.length > 0
      ? `<div class="char-gallery">${characters
          .map((row) => {
            const detail = [
              row.species,
              row.gender,
              row.age != null ? `${row.age}` : null,
              row.job || row.preferredJob,
            ]
              .filter(Boolean)
              .map((part) => escapeHtml(String(part)))
              .join(" · ");
            const img = row.previewUrl
              ? `<img class="char-shot" src="${row.previewUrl}" alt="" />`
              : `<div class="char-shot placeholder" aria-hidden="true"></div>`;
            return `<article class="char-tile${row.active ? " is-active" : ""}">
              ${img}
              <div class="char-tile-info">
                <strong>${escapeHtml(row.name)}${
                  row.active ? ' <span class="char-badge">сейчас</span>' : ""
                }</strong>
                <span class="muted">${detail || `Слот ${Number(row.slot) || "-"}`}</span>
              </div>
            </article>`;
          })
          .join("")}</div>`
      : `<p class="panel-note">${
          player.saves?.enabled
            ? "Персонажи в сейвах не найдены."
            : "PLAYER_SAVES_DIR не настроен - только manifest, если он есть."
        }</p>`;

  const noteRows =
    notes.length > 0
      ? `<div class="note-feed">${notes
          .map(
            (row) => `<article class="note-item">
            <header>${escapeHtml(formatDateTime(row.at))} · ${escapeHtml(
              row.admin || "?"
            )}</header>
            <p>${escapeHtml(row.text)}</p>
          </article>`
          )
          .join("")}</div>`
      : '<p class="panel-note">Публичных заметок нет.</p>';

  const banBlock =
    bans.length > 0
      ? `<div class="account-card">
          <h3>Блокировки</h3>
          <div class="note-feed">${bans
            .map((row) => {
              const until = formatBanExpiry(row.expires, !row.expires);
              return `<article class="note-item ban">
              <header>${escapeHtml(row.role || "Server")} · ${escapeHtml(
                formatDateTime(row.at)
              )} · до ${escapeHtml(until)} · ${escapeHtml(row.admin || "")}</header>
              <p>${escapeHtml(row.reason || "")}</p>
            </article>`;
            })
            .join("")}</div>
        </div>`
      : "";

  els.accountBody.innerHTML = `
    <div class="account-layout">
      <div class="account-top">
        <div class="account-card identity">
          <div class="account-row">
            ${avatar}
            <div class="account-meta">
              <strong>${escapeHtml(name)}</strong>
              <span>${escapeHtml(user.username || "")}</span>
            </div>
          </div>
          <div class="account-ckey">
            <span class="account-ckey-label">ckey</span>
            <span class="account-ckey-value">${escapeHtml(player.ckey)}</span>
          </div>
        </div>

        <div class="account-card">
          <h3>Сводка</h3>
          <div class="stat-stack stat-stack-cols">
            <div class="stat-line"${tipAttr("Время Living - основной счётчик онлайна в теле")}>
              <span>В игре</span>
              <strong>${escapeHtml(formatHours(living))}</strong>
            </div>
            <div class="stat-line"${tipAttr(statusTip)}>
              <span>Статус</span>
              <strong class="${statusClass}">${escapeHtml(status.label)}</strong>
            </div>
            ${
              status.kind !== "active"
                ? `<div class="stat-line">
              <span>До снятия</span>
              <strong>${escapeHtml(
                formatBanExpiry(status.expires, status.permanent)
              )}</strong>
            </div>`
                : ""
            }
            <div class="stat-line">
              <span>Ранг</span>
              <strong>${escapeHtml(info.rank || "-")}</strong>
            </div>
            <div class="stat-line"${tipAttr("спасибо большое за поддержку! *hug")}>
              <span>Supporter tier</span>
              <strong>${escapeHtml(String(info.supporterTier ?? 0))}</strong>
            </div>
            <div class="stat-line">
              <span>Первый вход</span>
              <strong>${escapeHtml(formatDateTime(info.firstSeen))}</strong>
            </div>
            <div class="stat-line">
              <span>Последний</span>
              <strong>${escapeHtml(formatDateTime(info.lastSeen))}</strong>
            </div>
          </div>
          ${
            status.kind !== "active"
              ? `<p class="panel-note status-note">${escapeHtml(statusDetail)}</p>`
              : ""
          }
        </div>
      </div>

      <div class="account-rest">
        <div class="account-card">
          <h3>Персонажи</h3>
          ${charRows}
        </div>

        <div class="account-card">
          <h3>Наиграно</h3>
          <div class="hours-grid hours-grid-3">
            <div>
              <h4${tipAttr("Как Total в Tracked Playtime")}>Итого</h4>
              ${renderHoursTable(totalPlaytimes)}
            </div>
            <div>
              <h4>Роли</h4>
              ${renderHoursTable(jobPlaytimes)}
            </div>
            <div>
              <h4${tipAttr("Special / ghost roles")}>Особые</h4>
              ${renderHoursTable(specialPlaytimes)}
            </div>
          </div>
        </div>

        <div class="account-card">
          <h3>Публичные заметки</h3>
          ${noteRows}
        </div>

        ${banBlock}
      </div>
    </div>
  `;
}

async function loadAccount() {
  if (!state.auth.user) {
    renderAccountPlaceholder();
    return;
  }
  renderAccountLoading();
  try {
    const data = await window.launcher.fetchPlayer();
    if (!data?.ok) {
      renderAccountError(data?.error || "Ошибка загрузки");
      return;
    }
    if (data.user) {
      state.auth.user = { ...state.auth.user, ...data.user };
      renderAuth();
    }
    renderAccountCard(data);
  } catch (error) {
    renderAccountError(error?.message || "Ошибка загрузки");
  }
}

async function openAccount() {
  setView("account");
  await loadAccount();
}

async function loadNews() {
  try {
    const result = await window.launcher.fetchNews();
    state.feeds = result.feeds || {};
    if (!result.ok && result.error) {
      toast(result.error, true);
    }
    ensureNewsReadInitialized();
    updateNewsBadges();
    renderNews();
  } catch (error) {
    els.newsList.innerHTML =
      '<p class="panel-note">Не удалось загрузить новости.</p>';
    toast(error?.message || "Ошибка загрузки новостей", true);
  }
}

function compareNewsIds(left, right) {
  if (!left || !right) {
    return 0;
  }
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  } catch {
    return String(left).localeCompare(String(right));
  }
}

function getNewestNewsId(feedKey) {
  const items = state.feeds[feedKey]?.items || [];
  let newest = null;
  for (const item of items) {
    if (!item?.id) continue;
    if (!newest || compareNewsIds(item.id, newest) > 0) {
      newest = String(item.id);
    }
  }
  return newest;
}

function countUnreadNews(feedKey) {
  const cursor = state.prefs?.newsRead?.[feedKey];
  if (!cursor) {
    return 0;
  }
  const items = state.feeds[feedKey]?.items || [];
  let count = 0;
  for (const item of items) {
    if (item?.id && compareNewsIds(item.id, cursor) > 0) {
      count += 1;
    }
  }
  return count;
}

function ensureNewsReadInitialized() {
  const newsRead = { ...(state.prefs.newsRead || {}) };
  let changed = false;
  for (const key of Object.keys(state.feeds || {})) {
    if (newsRead[key]) continue;
    const newest = getNewestNewsId(key);
    if (!newest) continue;
    newsRead[key] = newest;
    changed = true;
  }
  if (!changed) {
    return;
  }
  state.prefs = { ...state.prefs, newsRead };
  window.launcher.savePrefs({ newsRead });
}

function markFeedRead(feedKey) {
  const newest = getNewestNewsId(feedKey);
  if (!newest) {
    return;
  }
  const prev = state.prefs?.newsRead?.[feedKey];
  if (prev && compareNewsIds(prev, newest) >= 0) {
    updateNewsBadges();
    return;
  }
  const newsRead = { ...(state.prefs.newsRead || {}), [feedKey]: newest };
  state.prefs = { ...state.prefs, newsRead };
  window.launcher.savePrefs({ newsRead });
  updateNewsBadges();
}

function updateNewsBadges() {
  document.querySelectorAll(".news-badge").forEach((badge) => {
    const feedKey = badge.dataset.badge;
    const count = countUnreadNews(feedKey);
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 99 ? "99+" : String(count);
    } else {
      badge.hidden = true;
      badge.textContent = "0";
    }
  });
  if (els.navNewsBadge) {
    const total = countUnreadNews("dev") + countUnreadNews("game");
    if (total > 0) {
      els.navNewsBadge.hidden = false;
      els.navNewsBadge.textContent = total > 99 ? "99+" : String(total);
    } else {
      els.navNewsBadge.hidden = true;
      els.navNewsBadge.textContent = "0";
    }
  }
}

async function loadStatus() {
  const kind = statusKindFromSelection();
  try {
    const result = await window.launcher.fetchStatus(kind);
    state.status = result;
  } catch (error) {
    state.status = {
      ok: false,
      kind,
      error: error?.message || String(error),
    };
  }
  renderStatus();
}

async function runProbes() {
  state.probing = true;
  Object.keys(state.servers).forEach((id) => setDot(id, null));
  els.refresh.disabled = true;
  syncSelectionUI();

  try {
    const result = await window.launcher.probeServers();
    state.probes = result.probes || {};
    state.recommendedId = result.recommendedId || "mainDirect";

    const current = state.probes[state.selectedId];
    if (!current?.ok && state.probes[state.recommendedId]?.ok) {
      state.selectedId = state.recommendedId;
    } else if (!state.prefs.preferredRoute) {
      state.selectedId = state.recommendedId;
    }
  } catch (error) {
    toast(error?.message || "Не удалось проверить маршруты", true);
  } finally {
    state.probing = false;
    els.refresh.disabled = false;
    Object.keys(state.servers).forEach((id) => setDot(id, state.probes[id]));
    syncSelectionUI();
  }
}

async function connect(serverId) {
  const id = serverId || state.selectedId;
  state.selectedId = id;
  syncSelectionUI();
  els.playMain.disabled = true;
  toast("Запускаем BYOND…");

  try {
    const result = await window.launcher.connect(id);
    if (!result.ok) {
      toast(result.error || "Не удалось открыть BYOND", true);
      return;
    }
    state.prefs.lastServerId = id;
    state.prefs.lastConnectedAt = Date.now();
    state.prefs.preferredRoute = state.servers[id]?.route;
    renderLastLine();
    toast(`Открыто: ${result.label}`);
  } catch (error) {
    toast(error?.message || "Ошибка запуска", true);
  } finally {
    els.playMain.disabled = false;
  }
}

function closeRouteMenu() {
  if (els.routeMenu) {
    els.routeMenu.hidden = true;
  }
  if (els.routeDropdown) {
    els.routeDropdown.classList.remove("open");
  }
  if (els.routeTrigger) {
    els.routeTrigger.setAttribute("aria-expanded", "false");
  }
}

function toggleRouteMenu() {
  if (!els.routeMenu || !els.routeDropdown) {
    return;
  }
  const willOpen = els.routeMenu.hidden;
  els.routeMenu.hidden = !willOpen;
  els.routeDropdown.classList.toggle("open", willOpen);
  if (els.routeTrigger) {
    els.routeTrigger.setAttribute("aria-expanded", String(willOpen));
  }
}

function bindRouteDropdown() {
  if (els.routeTrigger) {
    els.routeTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleRouteMenu();
    });
  }
  document.addEventListener("click", (event) => {
    if (els.routeDropdown && !els.routeDropdown.contains(event.target)) {
      closeRouteMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeRouteMenu();
    }
  });
}

function bindUi() {
  document.querySelectorAll("[data-server]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prevKind = statusKindFromSelection();
      state.selectedId = btn.dataset.server;
      window.launcher.savePrefs({
        preferredRoute: state.servers[state.selectedId]?.route,
      });
      state.prefs.preferredRoute = state.servers[state.selectedId]?.route;
      syncSelectionUI();
      closeRouteMenu();
      if (statusKindFromSelection() !== prevKind) {
        loadStatus();
      }
    });
    btn.addEventListener("dblclick", () => connect(btn.dataset.server));
  });

  bindRouteDropdown();

  document.querySelectorAll(".news-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeFeed = tab.dataset.feed;
      if (!state.newsShown[state.activeFeed]) {
        const feed = state.feeds[state.activeFeed];
        state.newsShown[state.activeFeed] = Number(feed?.pageSize) || 40;
      }
      markFeedRead(state.activeFeed);
      renderNews();
    });
  });

  els.playMain.addEventListener("click", () => connect());
  els.refresh.addEventListener("click", async () => {
    els.refresh.classList.add("spinning");
    els.refresh.disabled = true;
    try {
      await Promise.all([runProbes(), loadNews(), loadStatus()]);
    } finally {
      els.refresh.classList.remove("spinning");
      els.refresh.disabled = false;
    }
  });

  document.querySelectorAll(".menu_button[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (view === "account") {
        openAccount();
        return;
      }
      setView(view);
    });
  });

  document.getElementById("open-wiki").addEventListener("click", () => {
    window.launcher.openExternal(state.links.wiki);
  });
  document.getElementById("open-boosty").addEventListener("click", () => {
    window.launcher.openExternal(state.links.boosty);
  });
  document.getElementById("open-discord").addEventListener("click", () => {
    window.launcher.openExternal(state.links.discord);
  });
  document.getElementById("open-byond").addEventListener("click", () => {
    openByondModal();
  });
  document.getElementById("check-updates").addEventListener("click", () => {
    checkForLauncherUpdate({ manual: true });
  });
  if (els.vtLink) {
    els.vtLink.addEventListener("click", (event) => {
      event.preventDefault();
      const url = els.vtLink.dataset.url;
      if (url) {
        window.launcher.openExternal(url);
      }
    });
  }
  document.getElementById("patch-byond-ads").addEventListener("click", () => {
    runByondAdPatch();
  });
  document.getElementById("run-diag").addEventListener("click", () => {
    runConnectionDiag();
  });

  bindByondModal();

  els.authLogin.addEventListener("click", async () => {
    els.authLogin.disabled = true;
    toast("Открываем Discord…");
    try {
      const result = await window.launcher.authLogin();
      if (!result.ok) {
        toast(result.error || "Не удалось начать вход", true);
        return;
      }
      toast("Подтверди вход в браузере");
    } catch (error) {
      toast(error?.message || "Ошибка входа", true);
    } finally {
      els.authLogin.disabled = false;
    }
  });

  els.authLogout.addEventListener("click", async () => {
    await window.launcher.authLogout();
    state.auth.user = null;
    renderAuth();
    if (state.view === "account") {
      renderAccountPlaceholder();
    }
    toast("Вышел из Discord");
  });

  window.launcher.onAuthChanged((payload) => {
    if (payload?.error) {
      toast(payload.error, true);
    }
    state.auth.user = payload?.user || null;
    renderAuth();
    if (payload?.user) {
      const name = payload.user.globalName || payload.user.username;
      toast(`Вошёл: ${name}`);
      if (state.view === "account") {
        loadAccount();
      }
    } else if (state.view === "account") {
      renderAccountPlaceholder();
    }
  });

  if (window.launcher.onUpdateDownloadProgress) {
    window.launcher.onUpdateDownloadProgress((payload) => {
      if (!els.updateProgress || els.updateProgress.hidden) {
        // Only show bar once user started an install.
        return;
      }
      setUpdateProgress(payload?.percent ?? 0, true);
      if (payload?.percent != null) {
        toast(`Скачиваем обновление… ${payload.percent}%`);
      }
    });
  }
}

function setByondState(installed, byondPath, byondVersion) {
  state.byondInstalled = Boolean(installed);
  state.byondPath = byondPath || null;
  if (byondVersion !== undefined) {
    state.byondVersion = byondVersion || null;
  }
  if (els.byondBtn) {
    els.byondBtn.classList.toggle("ok", state.byondInstalled);
    els.byondBtn.title = state.byondInstalled
      ? `BYOND найден${state.byondVersion ? ` · ${state.byondVersion}` : ""}`
      : "BYOND не найден - нажми, чтобы указать путь";
  }
  renderByondModal();
}

function renderByondModal() {
  const statusEl = document.getElementById("byond-modal-status");
  const versionEl = document.getElementById("byond-modal-version");
  const pathEl = document.getElementById("byond-modal-path");
  const resetBtn = document.getElementById("byond-modal-reset");
  if (!statusEl || !versionEl || !pathEl) {
    return;
  }
  statusEl.textContent = state.byondInstalled ? "Найден" : "Не найден";
  statusEl.classList.toggle("ok", state.byondInstalled);
  statusEl.classList.toggle("bad", !state.byondInstalled);
  versionEl.textContent = state.byondVersion || "-";
  pathEl.textContent = state.byondPath || "путь не указан";
  pathEl.title = state.byondPath || "";
  const patchEl = document.getElementById("byond-modal-patch");
  if (patchEl) {
    if (!state.byondInstalled) {
      patchEl.textContent = "-";
      patchEl.classList.remove("ok", "warn");
    } else {
      patchEl.textContent = state.byondPatched ? "Установлен" : "Не установлен";
      patchEl.classList.toggle("ok", state.byondPatched);
      patchEl.classList.toggle("warn", !state.byondPatched);
    }
  }
  if (resetBtn) {
    resetBtn.hidden = !state.prefs?.byondPath;
  }
}

function openByondModal() {
  const overlay = document.getElementById("byond-modal");
  if (!overlay) {
    return;
  }
  renderByondModal();
  overlay.hidden = false;
}

function closeByondModal() {
  const overlay = document.getElementById("byond-modal");
  if (overlay) {
    overlay.hidden = true;
  }
}

async function pickByondFromModal() {
  toast("Укажи dreamseeker.exe или папку BYOND…");
  try {
    const result = await window.launcher.pickByond();
    if (result?.cancelled) {
      return;
    }
    if (!result?.ok) {
      toast(result?.error || "Не удалось сохранить путь к BYOND", true);
      return;
    }
    state.prefs = { ...state.prefs, byondPath: result.byondPath };
    setByondState(true, result.byondPath, result.byondVersion);
    await refreshPatchBtnState();
    toast("BYOND путь сохранён");
  } catch (error) {
    toast(error?.message || "Ошибка выбора BYOND", true);
  }
}

async function resetByondFromModal() {
  if (!state.prefs?.byondPath) {
    return;
  }
  const result = await window.launcher.clearByondPath();
  state.prefs = { ...state.prefs };
  delete state.prefs.byondPath;
  setByondState(
    Boolean(result?.byondInstalled),
    result?.byondPath || null,
    result?.byondVersion
  );
  await refreshPatchBtnState();
  toast(
    result?.byondInstalled ? "BYOND найден автоматически" : "Ручной путь сброшен"
  );
}

function bindByondModal() {
  const overlay = document.getElementById("byond-modal");
  if (!overlay) {
    return;
  }
  document
    .getElementById("byond-modal-close")
    ?.addEventListener("click", closeByondModal);
  document
    .getElementById("byond-modal-pick")
    ?.addEventListener("click", pickByondFromModal);
  document
    .getElementById("byond-modal-reset")
    ?.addEventListener("click", resetByondFromModal);
  document
    .getElementById("byond-modal-download")
    ?.addEventListener("click", () => {
      window.launcher.openExternal(state.links.byond);
    });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeByondModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeByondModal();
    }
  });
}

function setToolBtnState(id, stateName) {
  const btn = document.getElementById(id);
  if (!btn) {
    return;
  }
  btn.classList.remove("ok", "warn");
  if (stateName === "ok" || stateName === "warn") {
    btn.classList.add(stateName);
  }
}

function setUpdateBtnState(kind) {
  // kind: ok | warn | null
  setToolBtnState("check-updates", kind);
  const btn = document.getElementById("check-updates");
  if (!btn) return;
  if (kind === "ok") {
    btn.title = "Установлена актуальная версия";
  } else if (kind === "warn") {
    btn.title = "Доступно обновление лаунчера";
  } else {
    btn.title = "Проверить обновления лаунчера";
  }
}

function setPatchBtnState(patched) {
  state.byondPatched = Boolean(patched);
  renderByondModal();
  setToolBtnState("patch-byond-ads", patched ? "ok" : null);
  const btn = document.getElementById("patch-byond-ads");
  if (!btn) return;
  btn.title = patched
    ? "No-ad patch уже установлен"
    : "Убрать рекламу BYOND (dreamseeker)";
}

async function refreshPatchBtnState() {
  try {
    const status = await window.launcher.getByondPatchStatus();
    setPatchBtnState(Boolean(status?.patched));
  } catch {
    setPatchBtnState(false);
  }
}

async function checkForLauncherUpdate(options = {}) {
  const manual = Boolean(options.manual);
  setUpdateProgress(0, false);
  try {
    const result = await window.launcher.checkUpdate();
    if (!result?.ok) {
      setUpdateProgress(0, false);
      if (manual) {
        toast(result?.error || "Не удалось проверить обновления", true);
      }
      return;
    }
    if (!result.update) {
      setUpdateBtnState("ok");
      setUpdateProgress(0, false);
      if (manual) {
        toast(`Актуальная версия: v${result.current}`);
      }
      return;
    }
    setUpdateBtnState("warn");
    const { version, url, notes } = result.update;
    const detail = notes ? `\n${notes}` : "";
    const accept = window.confirm(
      `Доступна новая версия лаунчера: v${version} (сейчас v${result.current}).${detail}\n\nСкачать и обновиться?`
    );
    if (!accept) {
      setUpdateProgress(0, false);
      return;
    }
    toast(`Скачиваем v${version}…`);
    setUpdateProgress(0, true);
    const installed = await window.launcher.installUpdate({ version, url });
    if (!installed?.ok) {
      setUpdateProgress(0, false);
      toast(installed?.error || "Не удалось скачать обновление", true);
      return;
    }
    if (installed.replaced) {
      toast(`Закрываем и ставим v${version}…`);
      return;
    }
    setUpdateProgress(0, false);
    toast(`Скачано: v${version}`);
  } catch (error) {
    setUpdateProgress(0, false);
    if (manual) {
      toast(error?.message || "Ошибка проверки обновлений", true);
    }
  }
}

async function runByondAdPatch() {
  const btn = document.getElementById("patch-byond-ads");
  if (btn) btn.disabled = true;
  toast("Готовим no-ad patch…");
  try {
    const options = {};
    let result = await window.launcher.patchByondAds(options);

    if (result?.needByond) {
      toast("Укажи dreamseeker.exe…");
      const picked = await window.launcher.pickByond();
      if (picked?.cancelled) {
        toast("Патч отменён");
        return;
      }
      if (!picked?.ok) {
        toast(picked?.error || "Не удалось выбрать BYOND", true);
        return;
      }
      state.prefs = { ...state.prefs, byondPath: picked.byondPath };
      setByondState(true, picked.byondPath, picked.byondVersion);
      result = await window.launcher.patchByondAds(options);
    }

    if (result?.needCloseByond) {
      const names = (result.processes || []).join(", ") || "BYOND";
      const accept = window.confirm(
        `Для патча нужно закрыть BYOND (${names}).\n\nЗакрыть сейчас и продолжить?`
      );
      if (!accept) {
        toast("Патч отменён - закрой BYOND и нажми снова");
        return;
      }
      options.closeByond = true;
      toast("Закрываем BYOND…");
      result = await window.launcher.patchByondAds(options);
    }

    if (result?.needElevation) {
      const accept = window.confirm(
        `BYOND в защищённой папке:\n${result.byondPath || ""}\n\nWindows запросит права администратора (UAC). Продолжить?`
      );
      if (!accept) {
        toast("Патч отменён");
        return;
      }
      options.allowElevation = true;
      options.closeByond = true;
      toast("Ждём подтверждение UAC…");
      result = await window.launcher.patchByondAds(options);
    }

    if (!result?.ok) {
      toast(
        result?.error || result?.message || "Не удалось применить патч",
        true
      );
      await refreshPatchBtnState();
      return;
    }
    setPatchBtnState(Boolean(result.patched ?? true));
    toast(result.message || "No-ad patch применён");
  } catch (error) {
    toast(error?.message || "Ошибка no-ad patch", true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function runConnectionDiag() {
  const btn = document.getElementById("run-diag");
  if (btn) btn.disabled = true;
  toast("Проверяем маршруты и DNS…");
  try {
    const result = await window.launcher.runConnectionDiag();
    if (!result?.ok) {
      toast(result?.error || "Диагностика не удалась", true);
      return;
    }
    const save = window.confirm(
      "Диагностика готова.\n\nСохранить отчёт в файл, чтобы отправить админу?"
    );
    if (!save) {
      toast("Диагностика завершена (отчёт не сохранён)");
      return;
    }
    const saved = await window.launcher.saveDiagReport(result.report);
    if (saved?.cancelled) {
      toast("Сохранение отменено");
      return;
    }
    if (!saved?.ok) {
      toast(saved?.error || "Не удалось сохранить файл", true);
      return;
    }
    toast(`Отчёт сохранён: ${saved.path}`);
  } catch (error) {
    toast(error?.message || "Ошибка диагностики", true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadVirusTotalLink() {
  if (!els.vtLink) {
    return;
  }
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/3raz3rr/orbitalis-launcher/main/virustotal.json",
      { cache: "no-store" }
    );
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    if (!data?.virustotal) {
      return;
    }
    const ver = data.version ? `v${data.version}` : "";
    els.vtLink.hidden = false;
    els.vtLink.textContent = ver ? `VirusTotal ${ver}` : "VirusTotal";
    els.vtLink.title = data.sha256
      ? `VirusTotal · SHA256 ${data.sha256}`
      : "Отчёт VirusTotal";
    els.vtLink.dataset.url = data.virustotal;
  } catch {
    // offline / raw github unavailable
  }
}

async function boot() {
  initParallax();
  setUpdateProgress(0, false);
  setView("home");
  const data = await window.launcher.getBootstrap();
  state.servers = data.servers;
  state.links = data.links;
  state.prefs = data.prefs || {};
  state.auth = {
    configured: Boolean(data.auth?.configured),
    user: data.auth?.user || null,
  };
  state.selectedId =
    data.prefs?.lastServerId && data.servers[data.prefs.lastServerId]
      ? data.prefs.lastServerId
      : "mainDirect";

  els.version.textContent = `v${data.launcherVersion}`;
  setByondState(data.byondInstalled, data.byondPath, data.byondVersion);
  setPatchBtnState(Boolean(data.byondPatched));

  renderAuth();
  renderLastLine();
  bindUi();
  syncSelectionUI();
  await Promise.all([runProbes(), loadNews(), loadStatus()]);
  checkForLauncherUpdate();
  loadVirusTotalLink();
}

boot();
