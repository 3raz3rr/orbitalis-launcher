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
  logs: {
    configured: false,
    apiUrl: null,
    staff: false,
    tree: null,
    round: null,
    selectedFiles: {},
    activeTab: "files",
    jobId: null,
    viewMeta: null,
    page: 1,
    lines: [],
    actors: { ckeys: [], names: [] },
    enabledCats: null,
    loadingMore: false,
  },
  music: {
    configured: false,
    apiUrl: null,
    ready: false,
    canModerate: false,
    ckey: null,
    tab: "mine",
    tracks: [],
    playlistIds: [],
    playlistTracks: [],
    counts: { mine: 0, public: 0, playlist: 0 },
    nowPlaying: null,
    q: "",
    loading: false,
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
  viewLogs: document.getElementById("view-logs"),
  viewMusic: document.getElementById("view-music"),
  accountBody: document.getElementById("account-body"),
  navNewsBadge: document.getElementById("nav-news-badge"),
  navLogs: document.getElementById("nav-logs"),
  navMusic: document.getElementById("nav-music"),
  logsStatusNote: document.getElementById("logs-status-note"),
  musicStatusNote: document.getElementById("music-status-note"),
  musicSearch: document.getElementById("music-search"),
  musicUploadBtn: document.getElementById("music-upload-btn"),
  musicBody: document.getElementById("music-body"),
  musicAudio: document.getElementById("music-audio"),
  musicPlayerToggle: document.getElementById("music-player-toggle"),
  musicPlayerTitle: document.getElementById("music-player-title"),
  musicPlayerSub: document.getElementById("music-player-sub"),
  musicPlayerSeek: document.getElementById("music-player-seek"),
  musicPlayerCur: document.getElementById("music-player-cur"),
  musicPlayerDur: document.getElementById("music-player-dur"),
  musicPlayerVol: document.getElementById("music-player-vol"),
  musicCountMine: document.getElementById("music-count-mine"),
  musicCountPublic: document.getElementById("music-count-public"),
  musicCountPlaylist: document.getElementById("music-count-playlist"),
  logsYear: document.getElementById("logs-year"),
  logsMonth: document.getElementById("logs-month"),
  logsDay: document.getElementById("logs-day"),
  logsRound: document.getElementById("logs-round"),
  logsResetLatest: document.getElementById("logs-reset-latest"),
  logsRoundPanel: document.getElementById("logs-round-panel"),
  logsRoundHeader: document.getElementById("logs-round-header"),
  logsTabs: document.getElementById("logs-tabs"),
  logsTabBody: document.getElementById("logs-tab-body"),
  logsReader: document.getElementById("logs-reader"),
  logsViewMeta: document.getElementById("logs-view-meta"),
  logsLoadMore: document.getElementById("logs-load-more"),
  logsCatToggles: document.getElementById("logs-cat-toggles"),
  logsLines: document.getElementById("logs-lines"),
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
  document.body.classList.toggle("on-logs", view === "logs");
  document.body.classList.toggle("on-music", view === "music");
  if (els.viewHome) {
    els.viewHome.hidden = view !== "home";
  }
  if (els.viewNews) {
    els.viewNews.hidden = view !== "news";
  }
  if (els.viewAccount) {
    els.viewAccount.hidden = view !== "account";
  }
  if (els.viewLogs) {
    els.viewLogs.hidden = view !== "logs";
  }
  if (els.viewMusic) {
    els.viewMusic.hidden = view !== "music";
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
  if (view === "logs") {
    openLogs();
  }
  if (view === "music") {
    openMusic();
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
      if (view === "logs") {
        if (!state.logs.staff) {
          toast("Нет доступа к логам", true);
          return;
        }
        setView(view);
        return;
      }
      if (view === "music") {
        setView("music");
        return;
      }
      setView(view);
    });
  });

  bindLogsUi();
  bindMusicUi();

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
    setLogsStaff(false);
    setMusicReady(false);
    renderAuth();
    if (state.view === "account") {
      renderAccountPlaceholder();
    }
    if (state.view === "logs" || state.view === "music") {
      setView("home");
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
      refreshLogsStaff();
      refreshMusicAccess();
      if (state.view === "account") {
        loadAccount();
      }
      if (state.view === "music") {
        openMusic();
      }
    } else {
      setLogsStaff(false);
      setMusicReady(false);
      if (state.view === "account") {
        renderAccountPlaceholder();
      }
      if (state.view === "logs" || state.view === "music") {
        setView("home");
      }
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

const LOG_CAT_TITLES = {
  SAY: "Речь",
  WHISPER: "Шёпот",
  EMOTE: "Эмоции",
  OOC: "OOC",
  MENTOR: "Ментор",
  PRAYER: "Молитвы",
  SUBTLE: "Subtle",
  COMPAT: "Compat",
  ACCESS: "Access",
  ATTACK: "Атаки",
  ADMIN: "Админ",
  EVENT: "События",
  SPAWN: "Spawn",
  LOGIN: "Login",
  LOGOUT: "Logout",
  DESPAWN: "Despawn",
};

function classifyLog(type, body) {
  switch (type) {
    case "GAME-SAY":
      return { label: "SAY", cat: "SAY" };
    case "GAME-WHISPER":
      return { label: "WHISPER", cat: "WHISPER" };
    case "GAME-EMOTE":
    case "GAME-RADIO-EMOTE":
      return { label: "EMOTE", cat: "EMOTE" };
    case "GAME-OOC":
      return { label: "OOC", cat: "OOC" };
    case "GAME-MENTOR":
      return { label: "MENTOR", cat: "MENTOR" };
    case "GAME-PRAYER":
      return { label: "PRAYER", cat: "PRAYER" };
    case "GAME-SUBTLE":
      return { label: "SUBTLE", cat: "SUBTLE" };
    case "GAME-TOPIC":
      return { label: "TOPIC", cat: "TOPIC" };
    case "GAME-COMPAT":
      return { label: "COMPAT", cat: "COMPAT" };
    case "GAME":
      return { label: "EVENT", cat: "EVENT" };
    case "GAME-ACCESS": {
      const bl = String(body || "").toLowerCase();
      if (bl.indexOf("mob login") === 0) return { label: "SPAWN", cat: "SPAWN" };
      if (bl.indexOf("login") === 0) return { label: "LOGIN", cat: "LOGIN" };
      if (bl.indexOf("logout") === 0) return { label: "LOGOUT", cat: "LOGOUT" };
      if (bl.indexOf("ghost sent to lobby") === 0) {
        return { label: "DESPAWN", cat: "DESPAWN" };
      }
      return { label: "ACCESS", cat: "ACCESS" };
    }
    default:
      return { label: type, cat: type };
  }
}

function setLogsStaff(staff) {
  state.logs.staff = staff === true;
  if (els.navLogs) {
    els.navLogs.hidden = !state.logs.staff;
  }
  if (!state.logs.staff && state.view === "logs") {
    setView("home");
  }
}

function logsApiHostLabel() {
  try {
    return state.logs.apiUrl ? new URL(state.logs.apiUrl).host : "?";
  } catch {
    return state.logs.apiUrl || "?";
  }
}

async function refreshLogsStaff() {
  if (els.navLogs) els.navLogs.hidden = true;
  state.logs.staff = false;
  if (!state.logs.configured || !state.auth.user) {
    setLogsStaff(false);
    return false;
  }
  try {
    const me = await window.launcher.logsMe();
    const allowed = Boolean(me?.ok && me.staff === true);
    setLogsStaff(allowed);
    if (els.logsStatusNote) {
      if (!me?.ok) {
        els.logsStatusNote.textContent = `${logsApiHostLabel()}: ${
          me?.error || "нет доступа"
        }`;
      } else if (!allowed) {
        els.logsStatusNote.textContent = `${logsApiHostLabel()} · нет доступа`;
      } else {
        els.logsStatusNote.textContent = me.bypass
          ? `${logsApiHostLabel()} · local bypass`
          : `${logsApiHostLabel()} · staff`;
      }
    }
    return allowed;
  } catch (error) {
    setLogsStaff(false);
    if (els.logsStatusNote) {
      els.logsStatusNote.textContent = `${logsApiHostLabel()}: ${
        error?.message || "ошибка logs API"
      }`;
    }
    return false;
  }
}

function fillSelect(select, values, selected) {
  if (!select) return;
  select.innerHTML = "";
  for (const value of values || []) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if (value === selected) opt.selected = true;
    select.appendChild(opt);
  }
  select.disabled = !(values && values.length);
}

function syncLogsSelectors(tree) {
  state.logs.tree = tree;
  fillSelect(els.logsYear, tree.years, tree.year);
  fillSelect(els.logsMonth, tree.months, tree.month);
  fillSelect(els.logsDay, tree.days, tree.day);
  fillSelect(els.logsRound, tree.rounds, tree.round);
}

function rememberLogsSelection(tree) {
  if (!tree?.year) return;
  const logsSelection = {
    year: tree.year || null,
    month: tree.month || null,
    day: tree.day || null,
    round: tree.round || null,
  };
  state.prefs = { ...(state.prefs || {}), logsSelection };
  window.launcher.savePrefs({ logsSelection }).catch(() => {});
}

function savedLogsSelection() {
  const sel = state.prefs?.logsSelection;
  if (!sel || typeof sel !== "object") return {};
  return {
    year: sel.year || "",
    month: sel.month || "",
    day: sel.day || "",
    round: sel.round || "",
  };
}

function showLogsReader(visible) {
  if (els.logsReader) els.logsReader.hidden = !visible;
}

async function openLogs() {
  if (!state.logs.configured) {
    toast("Logs API не настроен", true);
    return;
  }
  if (!state.auth.user) {
    toast("Сначала войди через Discord", true);
    return;
  }
  const staff = state.logs.staff || (await refreshLogsStaff());
  if (!staff) {
    toast("Нет доступа к логам", true);
    setView("home");
    return;
  }
  const saved = savedLogsSelection();
  await loadLogsTree(
    saved.year
      ? {
          year: saved.year,
          month: saved.month,
          day: saved.day,
          round: saved.round,
        }
      : {}
  );
}

async function resetLogsToLatest() {
  state.prefs = { ...(state.prefs || {}), logsSelection: null };
  window.launcher.savePrefs({ logsSelection: null }).catch(() => {});
  showLogsReader(false);
  state.logs.jobId = null;
  state.logs.lines = [];
  await loadLogsTree({
    year: "",
    month: "",
    day: "",
    round: "",
  });
  toast("Открыт самый свежий раунд");
}

async function loadLogsTree(patch = {}) {
  const current = state.logs.tree || {};
  const query = {};
  if (Object.prototype.hasOwnProperty.call(patch, "year")) {
    if (patch.year) query.year = patch.year;
  } else if (current.year) {
    query.year = current.year;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "month")) {
    if (patch.month) query.month = patch.month;
  } else if (!Object.prototype.hasOwnProperty.call(patch, "year") && current.month) {
    query.month = current.month;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "day")) {
    if (patch.day) query.day = patch.day;
  } else if (
    !Object.prototype.hasOwnProperty.call(patch, "year") &&
    !Object.prototype.hasOwnProperty.call(patch, "month") &&
    current.day
  ) {
    query.day = current.day;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "round")) {
    if (patch.round) query.round = patch.round;
  } else if (
    !Object.prototype.hasOwnProperty.call(patch, "year") &&
    !Object.prototype.hasOwnProperty.call(patch, "month") &&
    !Object.prototype.hasOwnProperty.call(patch, "day") &&
    current.round
  ) {
    query.round = current.round;
  }
  if (els.logsStatusNote) els.logsStatusNote.textContent = "Загрузка…";
  const tree = await window.launcher.logsTree(query);
  if (!tree?.ok) {
    if (els.logsStatusNote) {
      els.logsStatusNote.textContent = tree?.error || "Не удалось загрузить дерево";
    }
    toast(tree?.error || "Ошибка дерева логов", true);
    return;
  }
  syncLogsSelectors(tree);
  rememberLogsSelection(tree);
  if (els.logsStatusNote) {
    els.logsStatusNote.textContent = tree.round
      ? `${logsApiHostLabel()} · ${tree.day}.${tree.month}.${tree.year} · ${tree.round}`
      : `${logsApiHostLabel()} · нет раундов`;
  }
  if (tree.year && tree.month && tree.day && tree.round) {
    await loadLogsRound({
      year: tree.year,
      month: tree.month,
      day: tree.day,
      round: tree.round,
    });
  } else if (els.logsRoundPanel) {
    els.logsRoundPanel.hidden = true;
  }
}

async function loadLogsRound(query) {
  // Fast path: files only, then meta in background.
  const filesData = await window.launcher.logsRound({
    ...query,
    fields: "files",
  });
  if (!filesData?.ok) {
    toast(filesData?.error || "Ошибка раунда", true);
    return;
  }
  state.logs.round = {
    ...filesData,
    roundInfo: state.logs.round?.round === filesData.round ? state.logs.round.roundInfo : null,
    inventory: null,
  };
  state.logs.selectedFiles = {};
  for (const file of filesData.files || []) {
    const label = String(file.label || file.rel || "").toLowerCase();
    // game/inventory are huge — off by default
    const heavy = label.startsWith("game.") || label.startsWith("inventory.");
    state.logs.selectedFiles[file.rel] = !heavy;
  }
  state.logs.activeTab = "files";
  if (els.logsRoundPanel) els.logsRoundPanel.hidden = false;
  renderLogsRound();

  const metaData = await window.launcher.logsRound({
    ...query,
    fields: "meta",
  });
  if (metaData?.ok && state.logs.round?.round === metaData.round) {
    state.logs.round.roundInfo = metaData.roundInfo || null;
    renderLogsRound();
  }
}

async function ensureLogsInventory() {
  const round = state.logs.round;
  if (!round || round.inventory) return round?.inventory || null;
  const data = await window.launcher.logsRound({
    year: round.year,
    month: round.month,
    day: round.day,
    round: round.round,
    fields: "inventory",
  });
  if (!data?.ok) {
    toast(data?.error || "Ошибка inventory", true);
    return null;
  }
  if (state.logs.round?.round === round.round) {
    state.logs.round.inventory = data.inventory || {
      snapshot_count: 0,
      event_count: 0,
      snapshots: {},
      events: [],
    };
  }
  return state.logs.round.inventory;
}

function renderLogsRound() {
  const data = state.logs.round;
  if (!data) return;
  const info = data.roundInfo || {};
  if (els.logsRoundHeader) {
    els.logsRoundHeader.innerHTML = `
      <span class="round-title">${escapeHtml(data.round)}</span>
      <span>${escapeHtml(`${data.day}.${data.month}.${data.year}`)}</span>
      ${
        info.duration
          ? `<span>Длительность <span class="val">${escapeHtml(
              info.duration
            )}</span></span>`
          : ""
      }
      <span>Экипаж <span class="val">${(info.manifest || []).length}</span></span>
      ${
        (info.antagonists || []).length
          ? `<span>Антаги <span class="val antag">${info.antagonists.length}</span></span>`
          : ""
      }
      ${
        (info.ghost_roles || []).length
          ? `<span>Ghost <span class="val" style="color:#bd93f9">${info.ghost_roles.length}</span></span>`
          : ""
      }
    `;
  }

  const inv = data.inventory;
  const tabs = [
    { id: "files", label: `Файлы (${(data.files || []).length})` },
  ];
  if ((info.manifest || []).length) {
    tabs.push({ id: "manifest", label: `Manifest (${info.manifest.length})` });
  }
  if ((info.antagonists || []).length) {
    tabs.push({
      id: "antags",
      label: `Antagonists (${info.antagonists.length})`,
    });
  }
  if ((info.ghost_roles || []).length) {
    tabs.push({
      id: "ghost",
      label: `Ghost Roles (${info.ghost_roles.length})`,
    });
  }
  tabs.push({
    id: "inventory",
    label: inv
      ? `Inventory (${inv.snapshot_count || 0}/${inv.event_count || 0})`
      : "Inventory",
  });
  if (!tabs.some((t) => t.id === state.logs.activeTab)) {
    state.logs.activeTab = "files";
  }
  if (els.logsTabs) {
    els.logsTabs.innerHTML = tabs
      .map(
        (t) =>
          `<button type="button" class="logs-tab${
            t.id === state.logs.activeTab ? " active" : ""
          }" data-logs-tab="${t.id}">${escapeHtml(t.label)}</button>`
      )
      .join("");
  }
  renderLogsTabBody();
}

function renderLogsTabBody() {
  const data = state.logs.round;
  if (!data || !els.logsTabBody) return;
  const info = data.roundInfo || {};
  const tab = state.logs.activeTab;
  if (tab === "files") {
    const files = data.files || [];
    els.logsTabBody.innerHTML = `
      <div class="logs-files-panel">
        <div class="logs-files">
          ${files
            .map(
              (f) => `<label class="logs-file">
                <input type="checkbox" data-log-file="${escapeHtml(f.rel)}" ${
                state.logs.selectedFiles[f.rel] ? "checked" : ""
              } />
                <span>${escapeHtml(f.label)}</span>
              </label>`
            )
            .join("")}
        </div>
        <div class="logs-files-actions">
          <button type="button" class="tool-btn" id="logs-files-all">все</button>
          <button type="button" class="tool-btn" id="logs-files-none">снять</button>
          <button type="button" class="tool-btn logs-generate-btn" id="logs-generate">сгенерировать</button>
        </div>
      </div>
    `;
    return;
  }
  if (tab === "manifest") {
    els.logsTabBody.innerHTML = `
      <table class="logs-table">
        <thead><tr><th>ckey</th><th>имя</th><th>роль</th><th>antag</th></tr></thead>
        <tbody>
          ${(info.manifest || [])
            .map(
              (row) => `<tr>
                <td>${escapeHtml(row.ckey)}</td>
                <td>${escapeHtml(row.name)}</td>
                <td class="dept-${escapeHtml(row.dept || "other")}">${escapeHtml(
                  row.role
                )}${
                  row.latejoin ? '<span class="logs-late">LATE</span>' : ""
                }</td>
                <td>${escapeHtml(row.antag || "")}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
    return;
  }
  if (tab === "antags") {
    const objectives = info.objectives || {};
    els.logsTabBody.innerHTML = (info.antagonists || [])
      .map((a) => {
        const objs = objectives[String(a.ckey).toLowerCase()] || [];
        return `<div class="logs-antag-card">
          <div><span class="antag-role">${escapeHtml(
            a.role
          )}</span> · ${escapeHtml(a.ckey)} / ${escapeHtml(a.char)}</div>
          ${objs
            .map(
              (o) =>
                `<div class="panel-note">${escapeHtml(o.result)} — ${escapeHtml(
                  o.text
                )}</div>`
            )
            .join("")}
        </div>`;
      })
      .join("");
    return;
  }
  if (tab === "ghost") {
    els.logsTabBody.innerHTML = (info.ghost_roles || [])
      .map(
        (g) => `<div class="logs-ghost-card">
          <span class="ghost-role">${escapeHtml(g.role)}</span>
          · ${escapeHtml(g.ckey)} / ${escapeHtml(g.name)}
        </div>`
      )
      .join("");
    return;
  }
  if (tab === "inventory") {
    if (!data.inventory) {
      els.logsTabBody.innerHTML =
        '<p class="panel-note">Загрузка inventory…</p>';
      ensureLogsInventory().then((inv) => {
        if (!inv) {
          els.logsTabBody.innerHTML =
            '<p class="panel-note">Inventory недоступен</p>';
          return;
        }
        renderLogsRound();
      });
      return;
    }
    const inv = data.inventory || {};
    const snaps = Object.values(inv.snapshots || {});
    const events = inv.events || [];
    els.logsTabBody.innerHTML = `
      <p class="panel-note">Карта: ${escapeHtml(inv.map || "—")} · snapshots ${
      inv.snapshot_count || 0
    } · events ${inv.event_count || 0}${
      inv.events_omitted
        ? ` (показано ${events.length}, скрыто ${inv.events_omitted})`
        : ""
    }</p>
      <h3>Snapshots</h3>
      <table class="logs-table">
        <thead><tr><th>ckey</th><th>char</th><th>reason</th><th>items</th></tr></thead>
        <tbody>
          ${snaps
            .map(
              (s) => `<tr>
                <td>${escapeHtml(s.ckey)}</td>
                <td>${escapeHtml(s.char)}</td>
                <td>${escapeHtml(s.reason)}</td>
                <td>${escapeHtml(
                  (s.items || []).map((i) => i.name).join(", ")
                )}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <h3>Events</h3>
      <table class="logs-table">
        <thead><tr><th>time</th><th>ckey</th><th>action</th><th>item</th></tr></thead>
        <tbody>
          ${events
            .slice(0, 200)
            .map(
              (e) => `<tr>
                <td>${escapeHtml(String(e.timestamp || "").slice(11))}</td>
                <td>${escapeHtml(e.ckey)}</td>
                <td>${escapeHtml(e.action)}</td>
                <td>${escapeHtml(e.item_name || "")}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }
}

async function generateLogsView() {
  const files = Object.keys(state.logs.selectedFiles).filter(
    (rel) => state.logs.selectedFiles[rel]
  );
  if (!files.length) {
    toast("Выбери хотя бы один файл", true);
    return;
  }
  const genBtn = document.getElementById("logs-generate");
  if (genBtn) genBtn.disabled = true;
  toast("Склейка логов…");
  try {
    const result = await window.launcher.logsGenerate(files);
    if (!result?.ok) {
      toast(result?.error || "Ошибка generate", true);
      return;
    }
    state.logs.jobId = result.jobId;
    state.logs.viewMeta = result;
    state.logs.page = 0;
    state.logs.lines = [];
    state.logs.enabledCats = null;
    showLogsReader(true);
    await loadLogsMore();
  } finally {
    if (genBtn) genBtn.disabled = false;
  }
}

async function loadLogsMore() {
  if (!state.logs.jobId || state.logs.loadingMore) return;
  const meta = state.logs.viewMeta || {};
  const pages = meta.pages || 1;
  const nextPage = (state.logs.page || 0) + 1;
  if (nextPage > pages && state.logs.page > 0) return;

  state.logs.loadingMore = true;
  try {
    const data = await window.launcher.logsView({
      jobId: state.logs.jobId,
      page: nextPage,
      all: false,
    });
    if (!data?.ok) {
      toast(data?.error || "Ошибка view", true);
      return;
    }
    state.logs.page = data.page;
    state.logs.viewMeta = {
      ...(state.logs.viewMeta || {}),
      total: data.total,
      pages: data.pages,
      truncated: data.truncated,
      rawTotal: data.rawTotal,
      pageSize: data.pageSize,
      offset: data.offset,
    };
    const chunk = data.lines || [];
    if (nextPage === 1) {
      state.logs.lines = chunk;
      state.logs.actors = data.actors || { ckeys: [], names: [] };
      state.logs.enabledCats = null;
    } else {
      state.logs.lines = state.logs.lines.concat(chunk);
      // merge actors lightly
      const actors = data.actors || { ckeys: [], names: [] };
      const ckeys = new Set([
        ...(state.logs.actors.ckeys || []),
        ...(actors.ckeys || []),
      ]);
      const names = new Set([
        ...(state.logs.actors.names || []),
        ...(actors.names || []),
      ]);
      state.logs.actors = {
        ckeys: [...ckeys],
        names: [...names],
      };
    }
    renderLogsViewPage();
    const loaded = state.logs.lines.length;
    const total = data.total || loaded;
    toast(
      loaded >= total
        ? `Загружено ${loaded} строк`
        : `Загружено ${loaded} / ${total}`
    );
  } finally {
    state.logs.loadingMore = false;
  }
}

function beautifyLogLine(raw) {
  let ts = "";
  let type = "";
  let body = raw;
  const m = raw.match(/^\[([0-9-]{10} [0-9:.]{8,})]\s+([A-Z0-9-]+):\s*(.*)$/);
  if (m) {
    ts = m[1];
    type = m[2];
    body = m[3];
  }
  const timeOnly = ts ? ts.slice(11) : "";
  let html = "";
  if (timeOnly) html += `<span class="log-ts">[${escapeHtml(timeOnly)}]</span> `;
  let catId = "";
  if (type) {
    const cls = classifyLog(type, body);
    catId = cls.cat;
    html += `<span class="log-type log-type-${escapeHtml(
      catId
    )}">[${escapeHtml(cls.label)}]</span> `;
  }
  let b = escapeHtml(body);
  b = b.replace(
    /'\(([^)]+)\)'\/\(([^)]+)\)/g,
    (_m, ck, nm) =>
      `<span class="ckey" data-ckey="${escapeHtml(
        ck.toLowerCase()
      )}">${escapeHtml(ck)}</span> / <span class="char-name" data-name="${escapeHtml(
        nm.toLowerCase()
      )}">${escapeHtml(nm)}</span>`
  );
  b = b.replace(
    /\(mob_\d+\)/gi,
    (tag) => `<span class="mob-tag">${escapeHtml(tag)}</span>`
  );
  b = b.replace(
    /\([^()]*\(\d+,\d+,\d+\)\)/g,
    (z) => `<span class="zone">${escapeHtml(z)}</span>`
  );
  b = b
    .split(/(<[^>]+>)/g)
    .map((p) =>
      p.startsWith("<")
        ? p
        : p.replace(
            /&quot;([^&]*)&quot;/g,
            (_m, t) => `"<span class="speech">${t}</span>"`
          )
    )
    .join("");
  html += `<span class="log-text">${b}</span>`;
  return { html, catId, hasNoKey: /\*no key\*/i.test(raw) };
}

function ensureCatSet(cats) {
  if (!state.logs.enabledCats) {
    state.logs.enabledCats = {};
    for (const cat of cats) {
      state.logs.enabledCats[cat] = true;
    }
  } else {
    for (const cat of cats) {
      if (state.logs.enabledCats[cat] === undefined) {
        state.logs.enabledCats[cat] = true;
      }
    }
  }
}

function renderLogsViewPage() {
  const meta = state.logs.viewMeta || {};
  const loaded = state.logs.lines.length || 0;
  const total = meta.total || loaded;
  if (els.logsViewMeta) {
    els.logsViewMeta.textContent = `Строк: ${loaded}${
      loaded < total ? ` / ${total}` : ""
    }${meta.truncated ? ` (truncated from ${meta.rawTotal}+)` : ""}`;
  }
  if (els.logsLoadMore) {
    els.logsLoadMore.hidden = !(loaded < total);
    els.logsLoadMore.disabled = Boolean(state.logs.loadingMore);
  }

  const parsed = (state.logs.lines || []).map((raw) => {
    const b = beautifyLogLine(raw);
    return { raw, ...b };
  });
  const cats = [
    ...new Set(parsed.map((p) => p.catId).filter(Boolean)),
  ].sort();
  ensureCatSet(cats);
  if (els.logsCatToggles) {
    els.logsCatToggles.innerHTML = cats
      .map((cat) => {
        const on = state.logs.enabledCats[cat] !== false;
        return `<button type="button" class="logs-cat-btn${
          on ? "" : " off"
        }" data-log-cat="${escapeHtml(cat)}" title="${escapeHtml(
          LOG_CAT_TITLES[cat] || cat
        )}">${escapeHtml(cat)}</button>`;
      })
      .join("");
  }

  if (els.logsLines) {
    const frag = document.createDocumentFragment();
    const wrap = document.createElement("div");
    wrap.innerHTML = parsed
      .map(
        (p, i) =>
          `<div class="log-line" data-idx="${i}" data-cat="${escapeHtml(
            p.catId || ""
          )}" data-has-nokey="${p.hasNoKey ? "1" : "0"}">${p.html}</div>`
      )
      .join("");
    while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    els.logsLines.innerHTML = "";
    els.logsLines.appendChild(frag);
  }
  applyLogsFilters();
}

function splitFilterList(value) {
  return String(value || "")
    .trim()
    .split(/[\s,]+/)
    .map((s) => s.toLowerCase())
    .filter(Boolean);
}

function applyLogsFilters() {
  if (!els.logsLines) return;
  const hideNoKey = document.getElementById("logs-filter-nokey")?.checked;
  const ckeys = splitFilterList(
    document.getElementById("logs-filter-ckeys")?.value
  );
  const names = splitFilterList(
    document.getElementById("logs-filter-names")?.value
  ).map((n) => n.replace(/,/g, ""));
  const search = String(
    document.getElementById("logs-filter-search")?.value || ""
  )
    .trim()
    .toLowerCase();
  const showCkey = document.getElementById("logs-show-ckey")?.checked;
  const showNames = document.getElementById("logs-show-names")?.checked;
  const showZone = document.getElementById("logs-show-zone")?.checked;
  const hideMob = document.getElementById("logs-hide-mobtag")?.checked;

  els.logsLines.querySelectorAll(".log-line").forEach((line, idx) => {
    const raw = state.logs.lines[idx] || "";
    const cat = line.dataset.cat || "";
    let visible = true;
    if (hideNoKey && line.dataset.hasNokey === "1") visible = false;
    if (visible && cat && state.logs.enabledCats?.[cat] === false) {
      visible = false;
    }
    if (visible && ckeys.length) {
      visible = ckeys.some((ck) => raw.toLowerCase().includes(`'(${ck})'`));
    }
    if (visible && names.length) {
      const low = raw.toLowerCase();
      visible = names.some((nm) => low.includes(`/(${nm})`));
    }
    if (visible && search) {
      visible = raw.toLowerCase().includes(search);
    }
    line.hidden = !visible;
  });

  els.logsLines.querySelectorAll(".ckey").forEach((e) => {
    e.style.display = showCkey ? "" : "none";
  });
  els.logsLines.querySelectorAll(".char-name").forEach((e) => {
    e.style.display = showNames ? "" : "none";
  });
  els.logsLines.querySelectorAll(".zone").forEach((e) => {
    e.style.display = showZone ? "" : "none";
  });
  els.logsLines.querySelectorAll(".mob-tag").forEach((e) => {
    e.style.display = hideMob ? "none" : "";
  });
}

function bindLogsUi() {
  const onTreeChange = async (level) => {
    const patch = { year: els.logsYear.value };
    if (level === "month" || level === "day" || level === "round") {
      patch.month = els.logsMonth.value;
    } else {
      patch.month = "";
      patch.day = "";
      patch.round = "";
    }
    if (level === "day" || level === "round") {
      patch.day = els.logsDay.value;
    } else if (level === "month") {
      patch.day = "";
      patch.round = "";
    }
    if (level === "round") {
      patch.round = els.logsRound.value;
    } else if (level === "day") {
      patch.round = "";
    }
    showLogsReader(false);
    state.logs.jobId = null;
    await loadLogsTree(patch);
  };

  els.logsYear?.addEventListener("change", () => onTreeChange("year"));
  els.logsMonth?.addEventListener("change", () => onTreeChange("month"));
  els.logsDay?.addEventListener("change", () => onTreeChange("day"));
  els.logsRound?.addEventListener("change", () => onTreeChange("round"));
  els.logsResetLatest?.addEventListener("click", () => resetLogsToLatest());
  els.logsLoadMore?.addEventListener("click", () => loadLogsMore());
  els.logsLines?.addEventListener("scroll", () => {
    if (!els.logsLines || state.logs.loadingMore) return;
    const nearBottom =
      els.logsLines.scrollTop + els.logsLines.clientHeight >=
      els.logsLines.scrollHeight - 120;
    const meta = state.logs.viewMeta || {};
    const loaded = state.logs.lines.length || 0;
    if (nearBottom && loaded < (meta.total || 0)) {
      loadLogsMore();
    }
  });

  els.logsTabs?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-logs-tab]");
    if (!btn) return;
    state.logs.activeTab = btn.dataset.logsTab;
    renderLogsRound();
  });

  els.logsTabBody?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-log-file]");
    if (!input) return;
    state.logs.selectedFiles[input.dataset.logFile] = input.checked;
  });

  els.logsTabBody?.addEventListener("click", async (event) => {
    if (event.target.closest("#logs-files-all")) {
      for (const rel of Object.keys(state.logs.selectedFiles)) {
        state.logs.selectedFiles[rel] = true;
      }
      renderLogsTabBody();
      return;
    }
    if (event.target.closest("#logs-files-none")) {
      for (const rel of Object.keys(state.logs.selectedFiles)) {
        state.logs.selectedFiles[rel] = false;
      }
      renderLogsTabBody();
      return;
    }
    if (event.target.closest("#logs-generate")) {
      await generateLogsView();
    }
  });

  document.getElementById("logs-cat-all")?.addEventListener("click", () => {
    if (!state.logs.enabledCats) return;
    for (const key of Object.keys(state.logs.enabledCats)) {
      state.logs.enabledCats[key] = true;
    }
    renderLogsViewPage();
  });
  document.getElementById("logs-cat-none")?.addEventListener("click", () => {
    if (!state.logs.enabledCats) return;
    for (const key of Object.keys(state.logs.enabledCats)) {
      state.logs.enabledCats[key] = false;
    }
    renderLogsViewPage();
  });
  els.logsCatToggles?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-log-cat]");
    if (!btn || !state.logs.enabledCats) return;
    const cat = btn.dataset.logCat;
    state.logs.enabledCats[cat] = !state.logs.enabledCats[cat];
    renderLogsViewPage();
  });

  [
    "logs-filter-nokey",
    "logs-filter-ckeys",
    "logs-filter-names",
    "logs-filter-search",
    "logs-show-ckey",
    "logs-show-names",
    "logs-show-zone",
    "logs-hide-mobtag",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", applyLogsFilters);
    el.addEventListener("change", applyLogsFilters);
  });

  els.logsLines?.addEventListener("click", (event) => {
    const ck = event.target.closest(".ckey");
    if (ck) {
      const inp = document.getElementById("logs-filter-ckeys");
      const value = (ck.dataset.ckey || ck.textContent || "").toLowerCase();
      const parts = splitFilterList(inp.value);
      if (!parts.includes(value)) {
        parts.push(value);
        inp.value = parts.join(" ");
        applyLogsFilters();
      }
      return;
    }
    const nm = event.target.closest(".char-name");
    if (nm) {
      const inp = document.getElementById("logs-filter-names");
      const value = (nm.dataset.name || nm.textContent || "").toLowerCase();
      const parts = String(inp.value || "")
        .split(/\s*,\s*/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (!parts.includes(value)) {
        parts.push(value);
        inp.value = parts.join(", ");
        applyLogsFilters();
      }
    }
  });
}

function setMusicReady(ready, meta = {}) {
  state.music.ready = ready === true;
  state.music.canModerate = Boolean(meta.canModerate);
  state.music.ckey = meta.ckey || null;
  if (els.navMusic) {
    els.navMusic.hidden = !state.music.ready;
  }
  if (!state.music.ready && state.view === "music") {
    setView("home");
  }
}

function musicApiHostLabel() {
  try {
    return state.music.apiUrl ? new URL(state.music.apiUrl).host : "?";
  } catch {
    return state.music.apiUrl || "?";
  }
}

function formatMusicDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatMusicSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function refreshMusicAccess() {
  if (els.navMusic) els.navMusic.hidden = true;
  state.music.ready = false;
  state.music.canModerate = false;
  state.music.ckey = null;
  if (!state.music.configured || !state.auth.user) {
    setMusicReady(false);
    if (els.musicStatusNote) {
      els.musicStatusNote.textContent = state.music.configured
        ? "Войди через Discord"
        : "Music API не настроен";
    }
    return { ok: false, error: state.music.configured ? "unauthorized" : "not_configured" };
  }
  try {
    const me = await window.launcher.musicMe();
    if (!me?.ok) {
      setMusicReady(false);
      const err = me?.error || "нет доступа";
      if (els.musicStatusNote) {
        const msg =
          err === "ckey_not_linked"
            ? "Привяжи ckey в аккаунте"
            : me?.message || err;
        els.musicStatusNote.textContent = `${musicApiHostLabel()}: ${msg}`;
      }
      return { ok: false, error: err, message: me?.message };
    }
    setMusicReady(true, {
      ckey: me.ckey,
      canModerate: me.canModerate,
    });
    if (els.musicStatusNote) {
      const mod = me.canModerate ? " · руководство" : "";
      els.musicStatusNote.textContent = `${musicApiHostLabel()} · ${me.ckey}${mod}`;
    }
    return { ok: true, ckey: me.ckey };
  } catch (error) {
    setMusicReady(false);
    const message = error?.message || "ошибка music API";
    if (els.musicStatusNote) {
      els.musicStatusNote.textContent = `${musicApiHostLabel()}: ${message}`;
    }
    return { ok: false, error: message };
  }
}

function musicAccessToast(result) {
  if (!result || result.ok) return;
  if (result.error === "ckey_not_linked") {
    toast("Discord не привязан к ckey (хотя в аккаунте может отображаться). Обнови вход.", true);
    return;
  }
  if (result.error === "unauthorized" || result.error === "session_expired") {
    toast("Сначала войди через Discord", true);
    return;
  }
  if (result.error === "not_configured") {
    toast("Music API не настроен", true);
    return;
  }
  toast(result.message || result.error || "Нет доступа к музыке", true);
}

async function openMusic() {
  if (!state.music.configured) {
    toast("Music API не настроен", true);
    if (state.view === "music") setView("home");
    return;
  }
  if (!state.auth.user) {
    toast("Сначала войди через Discord", true);
    if (state.view === "music") setView("home");
    return;
  }
  const access =
    state.music.ready && state.music.ckey
      ? { ok: true }
      : await refreshMusicAccess();
  if (!access?.ok) {
    musicAccessToast(access);
    if (state.view === "music") setView("home");
    return;
  }
  await loadMusicTab();
  await refreshMusicCounts();
}

function setMusicTab(tab) {
  state.music.tab = tab === "public" || tab === "playlist" ? tab : "mine";
  document.querySelectorAll("[data-music-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.musicTab === state.music.tab);
  });
}

function musicIcon(name) {
  const icons = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zm7 0h3v14h-3z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.6 5 12.4l1.4-1.4 2.8 2.8L17.6 5.4 19 6.8z"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 14.6 12 10l4.6 4.6 1.4-1.4L12 7.2 6 13.2z"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 9.4 12 14l4.6-4.6 1.4 1.4L12 16.8 6 10.8z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6c5 0 9 4.5 10 6-1 1.5-5 6-10 6S3 13.5 2 12c1-1.5 5-6 10-6zm0 2.5A3.5 3.5 0 1 0 12 15a3.5 3.5 0 0 0 0-6.5z"/></svg>',
    eyeOff:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.3 2.3 21 20l-1.4 1.4-3.1-3.1A11.5 11.5 0 0 1 12 18c-5 0-9-4.5-10-6 0.4-.6 1.4-2 2.9-3.3L1.9 3.7 3.3 2.3zM12 6c5 0 9 4.5 10 6-.3.5-1 1.5-2.1 2.7L16.5 11A3.5 3.5 0 0 0 12 8.5c-.3 0-.6 0-.9.1L8.7 6.2C9.7 6.1 10.8 6 12 6z"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 2h4v2H4V6h4l1-2zm1 6h2v8h-2v-8zm4 0h2v8h-2v-8zM7 10h2v8H7v-8z"/></svg>',
  };
  return icons[name] || "";
}

function musicIconBtn(act, icon, title, extraClass = "") {
  return `<button type="button" class="music-icon-btn ${extraClass}" data-music-act="${act}" title="${escapeHtml(
    title
  )}">${musicIcon(icon)}</button>`;
}

function renderMusicCounts() {
  const c = state.music.counts || {};
  if (els.musicCountMine) els.musicCountMine.textContent = String(c.mine || 0);
  if (els.musicCountPublic)
    els.musicCountPublic.textContent = String(c.public || 0);
  if (els.musicCountPlaylist)
    els.musicCountPlaylist.textContent = String(c.playlist || 0);
}

async function refreshMusicCounts() {
  try {
    const [mine, pub, pl] = await Promise.all([
      window.launcher.musicLibrary({ kind: "mine", q: "" }),
      window.launcher.musicLibrary({ kind: "public", q: "" }),
      window.launcher.musicPlaylistGet(),
    ]);
    state.music.counts = {
      mine: mine?.ok && Array.isArray(mine.tracks) ? mine.tracks.length : 0,
      public: pub?.ok && Array.isArray(pub.tracks) ? pub.tracks.length : 0,
      playlist:
        pl?.ok && Array.isArray(pl.trackIds)
          ? pl.trackIds.length
          : Array.isArray(pl?.tracks)
            ? pl.tracks.length
            : 0,
    };
    if (pl?.ok && Array.isArray(pl.trackIds)) {
      state.music.playlistIds = pl.trackIds;
    }
  } catch {
    // keep previous counts
  }
  renderMusicCounts();
}

async function loadMusicTab() {
  if (state.music.loading) return;
  state.music.loading = true;
  if (els.musicBody) {
    els.musicBody.innerHTML = `<p class="panel-note">Загрузка…</p>`;
  }
  try {
    if (state.music.tab === "playlist") {
      const pl = await window.launcher.musicPlaylistGet();
      if (!pl?.ok) {
        toast(pl?.error || "Не удалось загрузить плейлист", true);
        state.music.playlistIds = [];
        state.music.playlistTracks = [];
      } else {
        state.music.playlistIds = Array.isArray(pl.trackIds) ? pl.trackIds : [];
        state.music.playlistTracks = Array.isArray(pl.tracks) ? pl.tracks : [];
      }
      state.music.tracks = state.music.playlistTracks;
      state.music.counts.playlist = state.music.playlistIds.length;
    } else {
      const kind = state.music.tab === "public" ? "public" : "mine";
      const lib = await window.launcher.musicLibrary({
        kind,
        q: state.music.q || "",
      });
      if (!lib?.ok) {
        toast(lib?.error || "Не удалось загрузить библиотеку", true);
        state.music.tracks = [];
      } else {
        state.music.tracks = Array.isArray(lib.tracks) ? lib.tracks : [];
        if (!state.music.q) {
          state.music.counts[kind] = state.music.tracks.length;
        }
      }
      if (!state.music.playlistIds.length) {
        const pl = await window.launcher.musicPlaylistGet();
        if (pl?.ok && Array.isArray(pl.trackIds)) {
          state.music.playlistIds = pl.trackIds;
          state.music.counts.playlist = pl.trackIds.length;
        }
      }
    }
    renderMusicCounts();
    renderMusicBody();
  } finally {
    state.music.loading = false;
  }
}

function renderMusicBody() {
  if (!els.musicBody) return;
  const tracks = state.music.tracks || [];
  if (!tracks.length) {
    els.musicBody.innerHTML = `<p class="panel-note">Пусто</p>`;
    return;
  }
  const isPlaylist = state.music.tab === "playlist";
  const isMine = state.music.tab === "mine";
  const playlistSet = new Set(state.music.playlistIds.map(String));
  const playingId = state.music.nowPlaying?.id
    ? String(state.music.nowPlaying.id)
    : "";

  els.musicBody.innerHTML = tracks
    .map((t) => {
      const id = String(t.id || "");
      const inPl = playlistSet.has(id);
      const canDelete =
        isMine ||
        (state.music.canModerate && state.music.tab === "public") ||
        (isPlaylist &&
          (String(t.ckey || "").toLowerCase() ===
            String(state.music.ckey || "").toLowerCase() ||
            state.music.canModerate));
      const showVis = isMine;
      const vis = t.visibility === "private" ? "private" : "public";
      const isPlaying = playingId === id;
      return `<article class="music-row${
        isPlaying ? " is-playing" : ""
      }" data-track-id="${escapeHtml(id)}">
        <div class="music-row-main">
          ${musicIconBtn("play", "play", "Слушать", "music-play")}
          <div class="music-meta">
            <div class="music-title">${escapeHtml(t.name || "Track")}</div>
            <div class="music-sub">${escapeHtml(t.author || "Unknown")}${
        t.ckey ? ` · ${escapeHtml(t.ckey)}` : ""
      } · ${formatMusicDuration(t.duration_seconds)} · ${formatMusicSize(
        t.size_bytes
      )}${vis === "private" ? " · private" : ""}</div>
          </div>
        </div>
        <div class="music-row-actions">
          ${
            isPlaylist
              ? `${musicIconBtn("pl-up", "up", "Выше")}
                 ${musicIconBtn("pl-down", "down", "Ниже")}
                 ${musicIconBtn("pl-remove", "check", "Убрать из плейлиста", "is-active")}`
              : musicIconBtn(
                  inPl ? "pl-remove" : "pl-add",
                  inPl ? "check" : "plus",
                  inPl ? "В плейлисте" : "В плейлист",
                  inPl ? "is-active" : ""
                )
          }
          ${
            showVis
              ? musicIconBtn(
                  "toggle-vis",
                  vis === "private" ? "eye" : "eyeOff",
                  vis === "private" ? "В общую" : "Скрыть"
                )
              : ""
          }
          ${
            canDelete && (isMine || state.music.canModerate)
              ? musicIconBtn("delete", "trash", "Удалить", "danger")
              : ""
          }
        </div>
      </article>`;
    })
    .join("");
}

function setMusicPlayerUi({ title, sub, enabled } = {}) {
  if (els.musicPlayerTitle && title != null) {
    els.musicPlayerTitle.textContent = title;
  }
  if (els.musicPlayerSub && sub != null) {
    els.musicPlayerSub.textContent = sub;
  }
  if (els.musicPlayerToggle) {
    els.musicPlayerToggle.disabled = !enabled;
  }
  if (els.musicPlayerSeek) {
    els.musicPlayerSeek.disabled = !enabled;
  }
}

function syncMusicPlayerToggleIcon() {
  if (!els.musicPlayerToggle || !els.musicAudio) return;
  const paused = els.musicAudio.paused;
  els.musicPlayerToggle.innerHTML = musicIcon(paused ? "play" : "pause");
  els.musicPlayerToggle.title = paused ? "Play" : "Pause";
  els.musicPlayerToggle.classList.toggle("is-playing", !paused);
}

function syncMusicPlayerProgress() {
  const audio = els.musicAudio;
  if (!audio || !els.musicPlayerSeek) return;
  const dur = Number(audio.duration);
  const cur = Number(audio.currentTime) || 0;
  if (els.musicPlayerCur) {
    els.musicPlayerCur.textContent = formatMusicDuration(cur);
  }
  if (els.musicPlayerDur) {
    els.musicPlayerDur.textContent = Number.isFinite(dur)
      ? formatMusicDuration(dur)
      : "0:00";
  }
  if (!els.musicPlayerSeek.dataset.dragging) {
    const max = Number(els.musicPlayerSeek.max) || 1000;
    els.musicPlayerSeek.value = String(
      Number.isFinite(dur) && dur > 0 ? Math.round((cur / dur) * max) : 0
    );
  }
}

async function playMusicTrack(trackId) {
  if (!els.musicAudio) return;
  const track = (state.music.tracks || []).find(
    (t) => String(t.id) === String(trackId)
  );
  toast("Загрузка трека…");
  setMusicPlayerUi({
    title: track?.name || "Загрузка…",
    sub: track
      ? `${track.author || "Unknown"}${track.ckey ? ` · ${track.ckey}` : ""}`
      : "…",
    enabled: false,
  });
  const res = await window.launcher.musicLocalStream(trackId);
  if (!res?.ok) {
    toast(res?.error || "Не удалось воспроизвести", true);
    setMusicPlayerUi({
      title: "Нет трека",
      sub: "ошибка загрузки",
      enabled: false,
    });
    return;
  }
  state.music.nowPlaying = track
    ? { id: track.id, name: track.name, author: track.author, ckey: track.ckey }
    : { id: trackId };
  setMusicPlayerUi({
    title: state.music.nowPlaying.name || "Track",
    sub: `${state.music.nowPlaying.author || "Unknown"}${
      state.music.nowPlaying.ckey ? ` · ${state.music.nowPlaying.ckey}` : ""
    }`,
    enabled: true,
  });
  els.musicAudio.src = res.fileUrl || res.path;
  try {
    await els.musicAudio.play();
    toast("");
    syncMusicPlayerToggleIcon();
    renderMusicBody();
  } catch (error) {
    toast(error?.message || "Воспроизведение заблокировано", true);
  }
}

async function savePlaylistIds(nextIds) {
  const res = await window.launcher.musicPlaylistPut(nextIds);
  if (!res?.ok) {
    toast(res?.error || "Не удалось сохранить плейлист", true);
    return false;
  }
  state.music.playlistIds = Array.isArray(res.trackIds)
    ? res.trackIds
    : nextIds;
  state.music.counts.playlist = state.music.playlistIds.length;
  if (Array.isArray(res.tracks)) {
    state.music.playlistTracks = res.tracks;
  }
  renderMusicCounts();
  return true;
}

async function handleMusicAction(act, trackId) {
  const id = String(trackId || "");
  if (!id) return;
  if (act === "play") {
    await playMusicTrack(id);
    return;
  }
  if (act === "pl-add") {
    if (state.music.playlistIds.map(String).includes(id)) {
      toast("Уже в плейлисте");
      return;
    }
    const next = [...state.music.playlistIds.map(String), id];
    if (await savePlaylistIds(next)) {
      toast("Добавлено в плейлист");
      renderMusicBody();
    }
    return;
  }
  if (act === "pl-remove") {
    const next = state.music.playlistIds.map(String).filter((x) => x !== id);
    if (await savePlaylistIds(next)) {
      toast("Убрано из плейлиста");
      if (state.music.tab === "playlist") {
        await loadMusicTab();
      } else {
        renderMusicBody();
      }
    }
    return;
  }
  if (act === "pl-up" || act === "pl-down") {
    const ids = state.music.playlistIds.map(String);
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    const swap = act === "pl-up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= ids.length) return;
    const tmp = ids[idx];
    ids[idx] = ids[swap];
    ids[swap] = tmp;
    if (await savePlaylistIds(ids)) {
      await loadMusicTab();
    }
    return;
  }
  if (act === "toggle-vis") {
    const track = (state.music.tracks || []).find((t) => String(t.id) === id);
    const nextVis =
      track?.visibility === "private" ? "public" : "private";
    const res = await window.launcher.musicPatch({
      trackId: id,
      patch: { visibility: nextVis },
    });
    if (!res?.ok) {
      toast(res?.error || "Не удалось изменить видимость", true);
      return;
    }
    toast(nextVis === "public" ? "В общей библиотеке" : "Скрыто");
    await loadMusicTab();
    return;
  }
  if (act === "delete") {
    if (!window.confirm("Удалить трек безвозвратно?")) return;
    const res = await window.launcher.musicDelete(id);
    if (!res?.ok) {
      toast(res?.error || "Не удалось удалить", true);
      return;
    }
    state.music.playlistIds = state.music.playlistIds
      .map(String)
      .filter((x) => x !== id);
    toast("Трек удалён");
    await loadMusicTab();
    await refreshMusicCounts();
  }
}

function bindMusicUi() {
  document.querySelectorAll("[data-music-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      setMusicTab(btn.dataset.musicTab);
      await loadMusicTab();
    });
  });

  let searchTimer = null;
  els.musicSearch?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.music.q = String(els.musicSearch.value || "").trim();
      if (state.music.tab !== "playlist") {
        await loadMusicTab();
      } else {
        const q = state.music.q.toLowerCase();
        state.music.tracks = (state.music.playlistTracks || []).filter((t) => {
          if (!q) return true;
          return (
            String(t.name || "")
              .toLowerCase()
              .includes(q) ||
            String(t.author || "")
              .toLowerCase()
              .includes(q) ||
            String(t.ckey || "")
              .toLowerCase()
              .includes(q)
          );
        });
        renderMusicBody();
      }
    }, 280);
  });

  els.musicUploadBtn?.addEventListener("click", async () => {
    if (!state.music.ready) {
      toast("Нужен Discord и ckey", true);
      return;
    }
    els.musicUploadBtn.disabled = true;
    toast("Выбери файл…");
    try {
      const res = await window.launcher.musicPickAndUpload({
        visibility: "public",
      });
      if (res?.cancelled) {
        toast("Отменено");
        return;
      }
      if (!res?.ok) {
        toast(res?.error || "Загрузка не удалась", true);
        return;
      }
      toast("Загружено в общую");
      setMusicTab("mine");
      await loadMusicTab();
      await refreshMusicCounts();
    } catch (error) {
      toast(error?.message || "Ошибка загрузки", true);
    } finally {
      els.musicUploadBtn.disabled = false;
    }
  });

  els.musicBody?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-music-act]");
    if (!btn) return;
    const row = btn.closest("[data-track-id]");
    if (!row) return;
    btn.disabled = true;
    try {
      await handleMusicAction(btn.dataset.musicAct, row.dataset.trackId);
    } finally {
      btn.disabled = false;
    }
  });

  if (els.musicAudio) {
    els.musicAudio.volume = (Number(els.musicPlayerVol?.value) || 85) / 100;
    els.musicAudio.addEventListener("timeupdate", syncMusicPlayerProgress);
    els.musicAudio.addEventListener("loadedmetadata", syncMusicPlayerProgress);
    els.musicAudio.addEventListener("play", syncMusicPlayerToggleIcon);
    els.musicAudio.addEventListener("pause", syncMusicPlayerToggleIcon);
    els.musicAudio.addEventListener("ended", () => {
      syncMusicPlayerToggleIcon();
      syncMusicPlayerProgress();
    });
  }

  els.musicPlayerToggle?.addEventListener("click", async () => {
    if (!els.musicAudio?.src) return;
    try {
      if (els.musicAudio.paused) await els.musicAudio.play();
      else els.musicAudio.pause();
    } catch (error) {
      toast(error?.message || "Воспроизведение заблокировано", true);
    }
  });

  els.musicPlayerSeek?.addEventListener("pointerdown", () => {
    els.musicPlayerSeek.dataset.dragging = "1";
  });
  const endSeekDrag = () => {
    if (!els.musicPlayerSeek || !els.musicAudio) return;
    delete els.musicPlayerSeek.dataset.dragging;
    const dur = Number(els.musicAudio.duration);
    if (!Number.isFinite(dur) || dur <= 0) return;
    const max = Number(els.musicPlayerSeek.max) || 1000;
    els.musicAudio.currentTime =
      (Number(els.musicPlayerSeek.value) / max) * dur;
  };
  els.musicPlayerSeek?.addEventListener("pointerup", endSeekDrag);
  els.musicPlayerSeek?.addEventListener("change", endSeekDrag);

  els.musicPlayerVol?.addEventListener("input", () => {
    if (!els.musicAudio) return;
    els.musicAudio.volume = (Number(els.musicPlayerVol.value) || 0) / 100;
  });
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
  state.logs.configured = Boolean(data.logs?.configured);
  state.logs.apiUrl = data.logs?.apiUrl || null;
  state.music.configured = Boolean(data.music?.configured);
  state.music.apiUrl = data.music?.apiUrl || null;
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
  if (state.auth.user && state.logs.configured) {
    await refreshLogsStaff();
  } else {
    setLogsStaff(false);
  }
  if (state.auth.user && state.music.configured) {
    await refreshMusicAccess();
  } else {
    setMusicReady(false);
  }
  checkForLauncherUpdate();
  loadVirusTotalLink();
}

boot();
