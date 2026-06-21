// Clicking the toolbar icon opens (or focuses) a Subtabs container page.
// Container URLs can carry a ?l=…&u=… query (a saved workspace), so match by
// path prefix rather than an exact string.
const BASE = chrome.runtime.getURL("container.html");

chrome.action.onClicked.addListener(async () => {
  const existing = await chrome.tabs.query({ url: BASE + "*" });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    // Open bare; container.js restores the last view from storage.
    await chrome.tabs.create({ url: BASE });
  }
});
