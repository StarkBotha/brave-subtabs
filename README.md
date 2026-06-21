# Subtabs

A Manifest V3 browser extension (Brave / Chromium) that tiles several web pages
into a single browser tab. Pick a layout, drop a URL into each tile, and watch
them side by side — handy for keeping dashboards, local apps, or reference pages
in view at once without juggling a dozen real tabs.

## Workspaces are just bookmarks

The whole arrangement — the layout and each tile's URL — lives in the page's own
address. So when you've set up a view you like, press **Ctrl+D** to bookmark it,
and that bookmark reopens the exact same workspace. Make as many as you want; your
bookmark bar becomes the workspace switcher. There's nothing else to save or name.

The address looks like:

```
chrome-extension://<id>/container.html?l=grid&u=https%3A%2F%2Fa.local&u=https%3A%2F%2Fb.local
```

## Layouts

- **Single** — one full pane
- **Vertical** — two panes side by side
- **Horizontal** — two panes stacked
- **Grid** — a 2×2 grid of four panes

## Live address bar

Each tile has its own address bar that **follows along as you click through a
site** — it isn't stuck on the URL you first typed. Because the arrangement is
stored in the page URL, your bookmark captures wherever you actually ended up.
(See the permission note below for how this works.)

## Install (unpacked)

There's no build step — it's plain HTML/CSS/JS.

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Click the **Subtabs** toolbar icon to open it.

## Usage

- Click the toolbar icon to open Subtabs (it reopens your last view).
- Type a URL into a tile's address bar and press **Enter**.
- Pick a layout with the buttons in the top bar.
- Arrange things how you like, then **Ctrl+D** to bookmark that workspace.

## Permissions

- **storage** — remembers your last view so the toolbar icon reopens it.
- **host access to all sites (`<all_urls>`)** — needed for the live address bar.
  A tiny helper script runs inside each tile and reports the page's current URL
  back to the tile's bar. It stays completely idle on normal browsing: it only
  reports after Subtabs explicitly asks the tile it just loaded, so it never
  phones home from pages you visit outside the extension.

## Limitation: sites that block embedding

Because each tile is an `<iframe>`, any site that sends `X-Frame-Options` or a
restrictive `Content-Security-Policy: frame-ancestors` header will **refuse to
load** and show a blank tile (Google, most banks, many large sites do this). The
extension does not strip those headers. Subtabs works best with your own
dashboards/local sites and other embed-friendly pages.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest — `storage` + `<all_urls>`, registers the worker and content script |
| `background.js` | Service worker — opens/focuses the Subtabs tab on icon click |
| `container.html` | The page UI (layout buttons + tiles) |
| `container.css` | Dark, monospace theme |
| `container.js` | All the logic — reads/writes the workspace in the URL, renders tiles |
| `frame-tracker.js` | Content script — reports each tile's live URL back to the bar |
| `icons/icon128.png` | Toolbar icon |

## License

MIT
