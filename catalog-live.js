/* Shared foreground catalogue watcher for the admin and provider portals. */
window.watchCatalogChanges = function ({ url, enabled, refresh }) {
  let busy = false, token = "", stopped = false, failures = 0, retryAt = 0;
  async function poll(force = false) {
    if (stopped || busy || (!force && Date.now() < retryAt) || document.hidden || !enabled()) return;
    busy = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${url}?refresh=${Date.now()}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        const retry = Number(response.headers?.get?.("Retry-After"));
        if ((response.status === 429 || response.status === 503) && Number.isFinite(retry) && retry > 0) retryAt = Date.now() + Math.min(3600,retry)*1000;
        throw new Error("Catalogue revision unavailable");
      }
      const body = await response.json();
      if (typeof body.change_token !== "string") throw new Error("Invalid catalogue revision");
      if (force || token !== body.change_token) {
        if (await refresh() === false) return;
      }
      token = body.change_token;
      failures = 0; retryAt = 0;
    } catch (_) {
      // Preserve rendered data during an outage. Full-page retries would amplify
      // the load precisely when the API is returning busy responses.
      failures = Math.min(failures + 1, 4);
      retryAt = Math.max(retryAt,Date.now()+Math.min(120000,15000*2**(failures-1)));
    } finally { clearTimeout(timeout); busy = false; }
  }
  const timer = setInterval(() => { void poll(); }, 15000 + Math.floor(Math.random()*3000));
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
