/* Shared foreground catalogue watcher for the admin and provider portals. */
window.watchCatalogChanges = function ({ url, enabled, refresh }) {
  let busy = false, token = "", lastRefresh = 0, stopped = false;
  async function poll(force = false) {
    if (stopped || busy || document.hidden || !enabled()) return;
    busy = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${url}?refresh=${Date.now()}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Catalogue revision unavailable");
      const body = await response.json();
      if (typeof body.change_token !== "string") throw new Error("Invalid catalogue revision");
      if (force || token !== body.change_token) {
        if (await refresh() === false) return;
        lastRefresh = Date.now();
      }
      token = body.change_token;
    } catch (_) {
      if (force || Date.now() - lastRefresh >= 30000) {
        lastRefresh = Date.now();
        try { await refresh(); } catch (_) { /* Existing page loaders display errors. */ }
      }
    } finally { clearTimeout(timeout); busy = false; }
  }
  const timer = setInterval(() => { void poll(); }, 5000);
  const foreground = () => { void poll(true); };
  window.addEventListener("focus", foreground);
  document.addEventListener("visibilitychange", foreground);
  void poll();
  return () => {
    stopped = true; clearInterval(timer);
    window.removeEventListener("focus", foreground);
    document.removeEventListener("visibilitychange", foreground);
  };
};
