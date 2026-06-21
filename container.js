"use strict";

const PANE_COUNT = { single: 1, vertical: 2, horizontal: 2, grid: 4 };

const state = {
  subtabs: [],          // { id, title, url }
  layout: "single",
  panes: [null],        // subtab id per pane slot
  active: null          // active subtab id (for the strip + single layout)
};

const $strip   = document.getElementById("tabstrip");
const $panes   = document.getElementById("panes");
const $addTab  = document.getElementById("addTab");
const $layouts = document.getElementById("layouts");

/* ---------- persistence ---------- */
async function save() {
  await chrome.storage.local.set({ subtabsState: state });
}
async function load() {
  const { subtabsState } = await chrome.storage.local.get("subtabsState");
  if (subtabsState) Object.assign(state, subtabsState);
  if (state.subtabs.length === 0) addSubtab("https://", false);
  resizePanes(false);
}

/* ---------- helpers ---------- */
function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
         Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function normalizeUrl(raw) {
  let url = (raw || "").trim();
  if (!url) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith("about:")) {
    url = "https://" + url;
  }
  return url;
}

function labelFor(url) {
  try { return new URL(url).hostname || "new tab"; }
  catch { return "new tab"; }
}

function getSubtab(id) {
  return state.subtabs.find(t => t.id === id) || null;
}

/* ---------- mutations ---------- */
function addSubtab(url = "https://", render = true) {
  const tab = { id: uid(), url, title: labelFor(url) };
  state.subtabs.push(tab);
  state.active = tab.id;
  // drop it into the first empty pane slot, if any
  const slot = state.panes.indexOf(null);
  if (slot !== -1) state.panes[slot] = tab.id;
  if (render) { renderAll(); save(); }
  return tab;
}

function closeSubtab(id) {
  state.subtabs = state.subtabs.filter(t => t.id !== id);
  state.panes = state.panes.map(p => (p === id ? null : p));
  if (state.active === id) state.active = state.subtabs[0]?.id ?? null;
  if (state.subtabs.length === 0) addSubtab("https://", false);
  renderAll();
  save();
}

function setLayout(layout) {
  state.layout = layout;
  resizePanes(true);
}

function resizePanes(doRender) {
  const want = PANE_COUNT[state.layout];
  const next = state.panes.slice(0, want);
  // fill any new/empty slots with not-yet-shown subtabs, else first subtab
  for (let i = 0; i < want; i++) {
    if (!next[i]) {
      const unused = state.subtabs.find(t => !next.includes(t.id));
      next[i] = unused ? unused.id : (state.subtabs[0]?.id ?? null);
    }
  }
  state.panes = next;
  if (doRender) { renderAll(); save(); }
}

function assignPane(slot, id) {
  state.panes[slot] = id || null;
  state.active = id || state.active;
  renderStrip();
  renderPanes();
  save();
}

function navigatePane(slot, rawUrl) {
  const id = state.panes[slot];
  const tab = getSubtab(id);
  if (!tab) return;
  tab.url = normalizeUrl(rawUrl);
  tab.title = labelFor(tab.url);
  renderStrip();
  renderPanes();
  save();
}

/* ---------- rendering ---------- */
function renderStrip() {
  $strip.innerHTML = "";
  for (const tab of state.subtabs) {
    const el = document.createElement("div");
    el.className = "tab" + (tab.id === state.active ? " active" : "");
    el.title = tab.url;

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = tab.title || "new tab";
    el.appendChild(label);

    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.title = "Close sub-tab";
    close.addEventListener("click", (e) => { e.stopPropagation(); closeSubtab(tab.id); });
    el.appendChild(close);

    // clicking a sub-tab loads it into the first pane and marks it active
    el.addEventListener("click", () => {
      state.active = tab.id;
      state.panes[0] = tab.id;
      renderStrip();
      renderPanes();
      save();
    });

    $strip.appendChild(el);
  }
}

function renderLayoutButtons() {
  for (const btn of $layouts.querySelectorAll(".layout-btn")) {
    btn.classList.toggle("active", btn.dataset.layout === state.layout);
  }
}

function renderPanes() {
  $panes.className = state.layout;
  $panes.innerHTML = "";

  state.panes.forEach((id, slot) => {
    const tab = getSubtab(id);

    const pane = document.createElement("div");
    pane.className = "pane";

    // header: which sub-tab + editable address
    const head = document.createElement("div");
    head.className = "pane-head";

    const select = document.createElement("select");
    select.title = "Show sub-tab in this pane";
    const none = document.createElement("option");
    none.value = ""; none.textContent = "— empty —";
    select.appendChild(none);
    for (const t of state.subtabs) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.title || "new tab";
      if (t.id === id) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => assignPane(slot, select.value));
    head.appendChild(select);

    const urlInput = document.createElement("input");
    urlInput.className = "url";
    urlInput.type = "text";
    urlInput.placeholder = "https://your-dashboard.local …";
    urlInput.value = tab ? tab.url : "";
    urlInput.disabled = !tab;
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") navigatePane(slot, urlInput.value);
    });
    urlInput.addEventListener("blur", () => {
      if (tab && normalizeUrl(urlInput.value) !== tab.url) navigatePane(slot, urlInput.value);
    });
    head.appendChild(urlInput);

    pane.appendChild(head);

    // body: iframe or empty hint
    const body = document.createElement("div");
    body.className = "pane-body";

    if (tab && tab.url && tab.url !== "https://") {
      const frame = document.createElement("iframe");
      frame.src = tab.url;
      frame.referrerPolicy = "no-referrer";
      body.appendChild(frame);

      const note = document.createElement("div");
      note.className = "blocked-note";
      note.textContent = "Blank? This site blocks embedding (X-Frame-Options / CSP). Your own sites can allow it.";
      body.appendChild(note);
    } else {
      const empty = document.createElement("div");
      empty.className = "pane-empty";
      empty.textContent = tab
        ? "Type a URL above and press Enter"
        : "Pick a sub-tab for this pane";
      body.appendChild(empty);
    }

    pane.appendChild(body);
    $panes.appendChild(pane);
  });
}

function renderAll() {
  renderStrip();
  renderLayoutButtons();
  renderPanes();
}

/* ---------- events ---------- */
$addTab.addEventListener("click", () => addSubtab("https://"));
$layouts.addEventListener("click", (e) => {
  const btn = e.target.closest(".layout-btn");
  if (btn) setLayout(btn.dataset.layout);
});

load().then(renderAll);
