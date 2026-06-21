"use strict";

/*
 * Subtabs v2 — the whole workspace lives in the page URL.
 *
 *   container.html?l=<layout>&u=<tile1>&u=<tile2>...
 *
 * State is derived from the query string on load and written back to it (via
 * history.replaceState) on every change, so the browser address bar always
 * reflects what's on screen. Ctrl+D therefore bookmarks the current layout —
 * a bookmark IS a workspace. A small "last view" copy is kept in
 * chrome.storage.local only so the toolbar icon can reopen your last arrangement
 * when launched with no query string.
 */

const PANE_COUNT = { single: 1, vertical: 2, horizontal: 2, grid: 4 };

const state = {
  layout: "single",
  tiles: [{ url: "" }]   // one { url } per visible pane, in slot order
};

const $panes   = document.getElementById("panes");
const $layouts = document.getElementById("layouts");

/* ---------- url <-> state ---------- */
function readUrl() {
  const p = new URLSearchParams(location.search);
  const l = p.get("l");
  return {
    present: p.has("l") || p.has("u"),
    layout: PANE_COUNT[l] ? l : null,
    urls: p.getAll("u")
  };
}

function writeUrl() {
  const p = new URLSearchParams();
  p.set("l", state.layout);
  for (const t of state.tiles) p.append("u", t.url || "");
  const u = new URL(location.href);
  u.search = p.toString();
  history.replaceState(null, "", u);
  saveSoon();
}

let saveTimer;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ subtabsLast: state }), 400);
}

/* ---------- helpers ---------- */
function normalizeUrl(raw) {
  let url = (raw || "").trim();
  if (!url) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith("about:")) {
    url = "https://" + url;
  }
  return url;
}

// Only http(s) may ever reach an iframe src. Blocks javascript:, data:, blob:,
// file:, chrome: etc. — a javascript: URL in an iframe runs in THIS extension
// page's privileged origin, and tile URLs come from the (shareable) page query
// string, so this must be enforced everywhere a URL can enter a tile.
function safeHttpUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
  } catch { return ""; }
}

// Normalise a typed/stored value, then enforce the http(s) allowlist.
function cleanUrl(raw) {
  return safeHttpUrl(normalizeUrl(raw));
}

// Build a tiles array of the right length for a layout, carrying over URLs.
function fitTiles(layout, urls) {
  const n = PANE_COUNT[layout] || 1;
  const tiles = [];
  for (let i = 0; i < n; i++) tiles.push({ url: cleanUrl(urls[i]) });
  return tiles;
}

/* ---------- load ---------- */
async function load() {
  const fromUrl = readUrl();
  let layout = "single";
  let urls = [];

  if (fromUrl.present) {
    layout = fromUrl.layout || "single";
    urls = fromUrl.urls;
  } else {
    const { subtabsLast } = await chrome.storage.local.get("subtabsLast");
    if (subtabsLast && Array.isArray(subtabsLast.tiles)) {
      layout = PANE_COUNT[subtabsLast.layout] ? subtabsLast.layout : "single";
      urls = subtabsLast.tiles.map(t => t.url || "");
    }
  }

  state.layout = layout;
  state.tiles = fitTiles(layout, urls);
  writeUrl();   // normalise the address bar (fills in defaults, drops junk params)
}

/* ---------- mutations ---------- */
function setLayout(layout) {
  if (!PANE_COUNT[layout] || layout === state.layout) return;
  state.layout = layout;
  state.tiles = fitTiles(layout, state.tiles.map(t => t.url));
  writeUrl();
  renderAll();
}

// Explicit navigation (typed a URL + Enter): reload just this tile.
function navigateTile(slot, raw) {
  const tile = state.tiles[slot];
  if (!tile) return;
  tile.url = cleanUrl(raw);
  writeUrl();
  refreshBody(slot);
}

// In-page navigation reported by the content script: update the bar + URL, but
// do NOT reload the iframe (it's already there).
function liveUpdate(slot, url, title) {
  const tile = state.tiles[slot];
  if (!tile) return;
  if (typeof title === "string") tile.title = title;
  const safe = safeHttpUrl(url);
  if (safe && tile.url !== safe) {
    tile.url = safe;
    const bar = $panes.querySelector(`.pane[data-slot="${slot}"] input.url`);
    if (bar && document.activeElement !== bar) bar.value = safe;
    writeUrl();
  }
  updateDocTitle();
}

// The browser tab title follows the first tile's page title (falls back to the
// app name). Title is derived/transient — never stored in the workspace URL.
function updateDocTitle() {
  const first = state.tiles[0];
  document.title = (first && first.title) ? first.title : "Subtabs";
}

/* ---------- rendering ---------- */
function renderLayoutButtons() {
  for (const btn of $layouts.querySelectorAll(".layout-btn")) {
    btn.classList.toggle("active", btn.dataset.layout === state.layout);
  }
}

// The body (iframe or empty hint) for one slot — rebuilt on navigation/reload.
function buildBody(slot) {
  const tile = state.tiles[slot];
  const body = document.createElement("div");
  body.className = "pane-body";

  if (tile.url) {
    const frame = document.createElement("iframe");
    frame.src = tile.url;
    frame.referrerPolicy = "no-referrer";
    frame.dataset.slot = slot;
    // Handshake: once the framed page is up, tell our content script to start
    // reporting its URL. Fires again on every in-frame navigation.
    frame.addEventListener("load", () => {
      try { frame.contentWindow.postMessage({ __subtabs: "init" }, "*"); }
      catch (_) { /* ignore */ }
    });
    body.appendChild(frame);

    const note = document.createElement("div");
    note.className = "blocked-note";
    note.textContent = "Blank? This site blocks embedding (X-Frame-Options / CSP).";
    body.appendChild(note);
  } else {
    const empty = document.createElement("div");
    empty.className = "pane-empty";
    empty.textContent = "Type a URL above and press Enter";
    body.appendChild(empty);
  }
  return body;
}

function refreshBody(slot) {
  const pane = $panes.querySelector(`.pane[data-slot="${slot}"]`);
  if (!pane) return;
  pane.replaceChild(buildBody(slot), pane.querySelector(".pane-body"));
}

function renderPanes() {
  $panes.className = state.layout;
  $panes.innerHTML = "";

  state.tiles.forEach((tile, slot) => {
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.dataset.slot = slot;

    const head = document.createElement("div");
    head.className = "pane-head";

    const urlInput = document.createElement("input");
    urlInput.className = "url";
    urlInput.type = "text";
    urlInput.placeholder = "https://your-dashboard.local …";
    urlInput.value = tile.url || "";
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { navigateTile(slot, urlInput.value); urlInput.blur(); }
    });
    urlInput.addEventListener("blur", () => {
      if (cleanUrl(urlInput.value) !== tile.url) navigateTile(slot, urlInput.value);
    });
    head.appendChild(urlInput);

    const reload = document.createElement("button");
    reload.className = "icon-btn small";
    reload.textContent = "⟳";
    reload.title = "Reload tile";
    reload.addEventListener("click", () => refreshBody(slot));
    head.appendChild(reload);

    pane.appendChild(head);
    pane.appendChild(buildBody(slot));
    $panes.appendChild(pane);
  });
}

function renderAll() {
  renderLayoutButtons();
  renderPanes();
  updateDocTitle();
}

/* ---------- events ---------- */
$layouts.addEventListener("click", (e) => {
  const btn = e.target.closest(".layout-btn");
  if (btn) setLayout(btn.dataset.layout);
});

// Live URL reports from tile content scripts. Match the message to a tile by
// the identity of the iframe's contentWindow (reference compare is allowed even
// cross-origin).
window.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || d.__subtabs !== "url") return;
  for (const frame of $panes.querySelectorAll("iframe")) {
    if (frame.contentWindow === e.source) {
      liveUpdate(Number(frame.dataset.slot), d.url, d.title);
      break;
    }
  }
});

load().then(renderAll);
