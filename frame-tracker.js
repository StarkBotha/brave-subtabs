// Runs in every framed page. Stays completely idle until the Subtabs container
// (its direct parent) sends a one-time "init" handshake. Only then does it start
// reporting this frame's current URL back up, so it never touches normal browsing.
(() => {
  // Only sub-frames matter; the top-level page is never a Subtabs tile.
  if (window.top === window.self) return;
  if (!chrome.runtime || !chrome.runtime.id) return;

  // This script is injected into EVERY frame on the web. It must only ever talk
  // to the Subtabs container — identified by the extension's own origin. Without
  // this, any website embedding a cross-origin iframe could send the handshake
  // and use this script to read that iframe's current URL (a cross-origin leak).
  const EXT_ORIGIN = "chrome-extension://" + chrome.runtime.id;

  let armed = false;

  const report = () => {
    if (!armed) return;
    try {
      // Deliver only to the extension origin — never to some other parent.
      window.parent.postMessage(
        { __subtabs: "url", url: location.href, title: document.title },
        EXT_ORIGIN
      );
    } catch (_) { /* parent gone — ignore */ }
  };

  window.addEventListener("message", (e) => {
    // Accept the handshake only from our own extension's container window.
    if (e.origin !== EXT_ORIGIN) return;
    if (e.source !== window.parent) return;
    if (!e.data || e.data.__subtabs !== "init") return;

    if (!armed) {
      armed = true;

      // Instant signals for the cases they cover. NOTE: patching history here
      // only catches OUR isolated world — the page's own pushState (most SPA
      // routing) happens in the main world and is invisible to us, which is why
      // the poll below is the real workhorse.
      for (const m of ["pushState", "replaceState"]) {
        const orig = history[m];
        history[m] = function (...args) {
          const r = orig.apply(this, args);
          report();
          return r;
        };
      }
      window.addEventListener("popstate", report);
      window.addEventListener("hashchange", report);

      // Reliable fallback: watch our own location and report when it changes.
      // Reading location works fine from the isolated world, so this catches
      // SPA route changes the history hooks miss. The container dedupes repeats.
      let lastUrl = location.href;
      let lastTitle = document.title;
      setInterval(() => {
        if (location.href !== lastUrl || document.title !== lastTitle) {
          lastUrl = location.href;
          lastTitle = document.title;
          report();
        }
      }, 700);
    }
    report();
  });
})();
