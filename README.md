# Subtabs

A Manifest V3 browser extension (Brave / Chromium) that turns one ordinary browser
tab into a **container** holding several **sub-tabs**. Each sub-tab is a website
loaded in an iframe, and you can tile them in one of four layouts so you can watch
several pages at once inside a single real tab.

Handy for keeping a set of dashboards, local apps, or reference pages side by side
without juggling a dozen browser tabs.

## Layouts

- **Single** — one full pane
- **Vertical** — two panes side by side
- **Horizontal** — two panes stacked
- **Grid** — a 2×2 grid of four panes

Your sub-tabs, the chosen layout, and which sub-tab sits in which pane are all saved
to `chrome.storage.local`, so your workspace survives a browser restart.

## Install (unpacked)

There's no build step — it's plain HTML/CSS/JS.

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Click the **Subtabs** toolbar icon to open the container tab.

## Usage

- Click the toolbar icon to open (or focus) the Subtabs tab.
- Use **+** to add a sub-tab, then type a URL in its pane and press **Enter**.
- Pick a layout with the buttons in the top-right.
- Each pane has a dropdown to choose which sub-tab it shows and an editable address bar.

## Limitation: sites that block embedding

Because each pane is an `<iframe>`, any site that sends `X-Frame-Options` or a
restrictive `Content-Security-Policy: frame-ancestors` header will **refuse to load**
and show a blank pane (Google, most banks, many large sites do this). The extension
does not strip those headers — it only asks for the `storage` permission. Subtabs
works best with your own dashboards/local sites and other embed-friendly pages.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest — `storage` permission, registers the service worker |
| `background.js` | Service worker — opens/focuses the single container tab on icon click |
| `container.html` | The full-page UI (tab strip, layout buttons, panes) |
| `container.css` | Dark, monospace theme |
| `container.js` | All the logic — state, persistence, rendering |
| `icons/icon128.png` | Toolbar icon |

## License

MIT
