// Clicking the toolbar icon opens (or focuses) the Subtabs container page.
const CONTAINER_URL = chrome.runtime.getURL("container.html");

chrome.action.onClicked.addListener(async () => {
  const existing = await chrome.tabs.query({ url: CONTAINER_URL });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: CONTAINER_URL });
  }
});
