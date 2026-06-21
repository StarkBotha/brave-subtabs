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

// iframe sandbox: behave like a normal frame, but block SILENT top-navigation
// so an embedded page can't framebust (yank the whole Subtabs tab elsewhere).
// allow-same-origin keeps logins/cookies working; allow-top-navigation-by-user-
// activation still lets a real click navigate. Everything common stays enabled.
const TILE_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-downloads",
  "allow-modals",
  "allow-top-navigation-by-user-activation"
].join(" ");

// How long to wait for a tile to "phone home" before assuming it's blocked.
const BLOCK_TIMEOUT_MS = 2500;

const state = {
  layout: "single",
  tiles: [{ url: "" }]   // { url, title?, icon? } per visible pane, in slot order
};

const $panes   = document.getElementById("panes");
const $layouts = document.getElementById("layouts");

// Per-slot timers that reveal the "blocked" note if no report arrives.
const blockTimers = {};

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

// Favicons may be http(s) or inline data: images. Reject anything else.
function safeIconUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return ["http:", "https:", "data:"].includes(u.protocol) ? u.href : "";
  } catch { return ""; }
}

// Build a tiles array of the right length for a layout, carrying over each
// slot's url/title/icon so a layout change preserves what's already loaded.
function fitTiles(layout, prev) {
  const n = PANE_COUNT[layout] || 1;
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const p = prev[i];
    tiles.push(p ? { url: cleanUrl(p.url), title: p.title, icon: p.icon } : { url: "" });
  }
  return tiles;
}

/* ---------- load ---------- */
async function load() {
  const fromUrl = readUrl();
  let layout = "single";
  let prev = [];

  if (fromUrl.present) {
    layout = fromUrl.layout || "single";
    prev = fromUrl.urls.map(u => ({ url: u }));
  } else {
    const { subtabsLast } = await chrome.storage.local.get("subtabsLast");
    if (subtabsLast && Array.isArray(subtabsLast.tiles)) {
      layout = PANE_COUNT[subtabsLast.layout] ? subtabsLast.layout : "single";
      prev = subtabsLast.tiles;
    }
  }

  state.layout = layout;
  state.tiles = fitTiles(layout, prev);
  writeUrl();   // normalise the address bar (fills in defaults, drops junk params)
}

/* ---------- mutations ---------- */
function setLayout(layout) {
  if (!PANE_COUNT[layout] || layout === state.layout) return;
  state.layout = layout;
  state.tiles = fitTiles(layout, state.tiles);  // carries url/title/icon by slot
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
// do NOT reload the iframe (it's already there). A report also proves the tile
// loaded, so clear its "blocked" watchdog.
function liveUpdate(slot, url, title, icon) {
  const tile = state.tiles[slot];
  if (!tile) return;

  clearTimeout(blockTimers[slot]);
  const note = paneAt(slot)?.querySelector(".blocked-note");
  if (note) note.hidden = true;

  if (typeof title === "string") tile.title = title;
  if (typeof icon === "string") tile.icon = icon;
  const safe = safeHttpUrl(url);
  if (safe && tile.url !== safe) {
    tile.url = safe;
    const bar = paneAt(slot)?.querySelector("input.url");
    if (bar && document.activeElement !== bar) bar.value = safe;
    writeUrl();
  }
  updateTabIdentity();
}

// The browser tab's title and favicon follow the first tile (falling back to the
// app name / extension icon). Both are derived/transient — never stored in the
// workspace URL.
function updateTabIdentity() {
  const first = state.tiles[0];
  document.title = (first && first.title) ? first.title : "Subtabs";

  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  const icon = first && safeIconUrl(first.icon);
  link.href = icon || chrome.runtime.getURL("icons/icon128.png");
}

/* ---------- rendering ---------- */
function renderLayoutButtons() {
  for (const btn of $layouts.querySelectorAll(".layout-btn")) {
    btn.classList.toggle("active", btn.dataset.layout === state.layout);
  }
}

function paneAt(slot) {
  return $panes.children[slot] || null;
}

// (Re)build the body of one pane: an iframe for a real URL, else an empty hint.
// The body's dataset.url records what's mounted so the reconciler can tell when
// a tile genuinely changed (and avoid needless reloads).
function mountTile(body, slot, url) {
  clearTimeout(blockTimers[slot]);
  body.textContent = "";
  body.dataset.url = url;

  if (!url) {
    const empty = document.createElement("div");
    empty.className = "pane-empty";
    empty.textContent = "Type a URL above and press Enter";
    body.appendChild(empty);
    return;
  }

  const frame = document.createElement("iframe");
  frame.src = url;
  frame.dataset.slot = slot;
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", TILE_SANDBOX);
  // Handshake: once the framed page is up, tell our content script to start
  // reporting its URL/title/favicon. Fires again on every in-frame navigation.
  frame.addEventListener("load", () => {
    try { frame.contentWindow.postMessage({ __subtabs: "init" }, "*"); }
    catch (_) { /* ignore */ }
  });
  body.appendChild(frame);

  const note = document.createElement("div");
  note.className = "blocked-note";
  note.hidden = true;
  note.textContent = "This site blocks embedding (X-Frame-Options / CSP), so it can't be shown here.";
  body.appendChild(note);

  // Assume blocked until the tile's content script reports back — a page that
  // refuses to embed never runs our script, so the report never comes.
  blockTimers[slot] = setTimeout(() => { note.hidden = false; }, BLOCK_TIMEOUT_MS);
}

function createPane(slot) {
  const pane = document.createElement("div");
  pane.className = "pane";
  pane.dataset.slot = slot;

  const head = document.createElement("div");
  head.className = "pane-head";

  const urlInput = document.createElement("input");
  urlInput.className = "url";
  urlInput.type = "text";
  urlInput.placeholder = "https://your-dashboard.local …";
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { navigateTile(slot, urlInput.value); urlInput.blur(); }
  });
  urlInput.addEventListener("blur", () => {
    if (cleanUrl(urlInput.value) !== (state.tiles[slot] && state.tiles[slot].url)) {
      navigateTile(slot, urlInput.value);
    }
  });
  head.appendChild(urlInput);

  const reload = document.createElement("button");
  reload.className = "icon-btn small";
  reload.textContent = "⟳";
  reload.title = "Reload tile";
  reload.addEventListener("click", () => refreshBody(slot));
  head.appendChild(reload);

  pane.appendChild(head);

  const body = document.createElement("div");
  body.className = "pane-body";
  pane.appendChild(body);

  return pane;
}

// Reconcile the existing panes with state.tiles instead of rebuilding, so a tile
// that survives a layout change keeps its live iframe (no reload, no lost state).
function renderPanes() {
  $panes.className = state.layout;

  // Drop surplus panes when the layout shrinks.
  while ($panes.children.length > state.tiles.length) {
    const i = $panes.children.length - 1;
    clearTimeout(blockTimers[i]);
    delete blockTimers[i];
    $panes.removeChild($panes.lastChild);
  }

  state.tiles.forEach((tile, slot) => {
    let pane = paneAt(slot);
    if (!pane) { pane = createPane(slot); $panes.appendChild(pane); }

    const urlInput = pane.querySelector("input.url");
    if (document.activeElement !== urlInput) urlInput.value = tile.url || "";

    // Only (re)mount when the mounted URL actually differs — this is what keeps
    // a surviving tile from reloading on a layout switch.
    const body = pane.querySelector(".pane-body");
    if (body.dataset.url !== (tile.url || "")) mountTile(body, slot, tile.url || "");
  });
}

function refreshBody(slot) {
  const pane = paneAt(slot);
  if (!pane) return;
  mountTile(pane.querySelector(".pane-body"), slot, (state.tiles[slot] && state.tiles[slot].url) || "");
}

function renderAll() {
  renderLayoutButtons();
  renderPanes();
  updateTabIdentity();
}

/* ---------- events ---------- */
$layouts.addEventListener("click", (e) => {
  const btn = e.target.closest(".layout-btn");
  if (btn) setLayout(btn.dataset.layout);
});

// Live reports from tile content scripts. Match the message to a tile by the
// identity of the iframe's contentWindow (reference compare is allowed even
// cross-origin).
window.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || d.__subtabs !== "url") return;
  for (const frame of $panes.querySelectorAll("iframe")) {
    if (frame.contentWindow === e.source) {
      liveUpdate(Number(frame.dataset.slot), d.url, d.title, d.icon);
      break;
    }
  }
});

load().then(renderAll);
