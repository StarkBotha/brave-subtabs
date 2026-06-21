// Runs in every framed page. Stays completely idle until the Subtabs container
// (its direct parent) sends a one-time "init" handshake. Only then does it start
// reporting this frame's current URL back up, so it never touches normal browsing.
(() => {
  // Only sub-frames matter; the top-level page is never a Subtabs tile.
  if (window.top === window.self) return;

  let armed = false;

  const report = () => {
    if (!armed) return;
    try {
      window.parent.postMessage({ __subtabs: "url", url: location.href }, "*");
    } catch (_) { /* parent gone / cross-origin throw — ignore */ }
  };

  window.addEventListener("message", (e) => {
    // Trust only a handshake from our direct parent (the container window).
    if (e.source !== window.parent) return;
    if (!e.data || e.data.__subtabs !== "init") return;

    if (!armed) {
      armed = true;
      // Catch SPA route changes that don't fire a full load.
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
    }
    report();
  });
})();
