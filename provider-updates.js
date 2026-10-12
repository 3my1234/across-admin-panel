(() => {
  "use strict";
  window.ProviderAppUpdates = { watch };
  function watch(registrationPromise) {
    if (!("serviceWorker" in navigator)) return;
    const bar = document.createElement("aside");
    bar.className = "provider-update-bar";
    bar.setAttribute("role", "status");
    bar.hidden = true;
    const text = document.createElement("span");
    text.textContent = "An app update is ready. Finish what you are doing, then refresh.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Refresh app";
    bar.append(text, button);
    document.body.prepend(bar);
    let registration, requested = false, changed = false, reloaded = false, checkInProgress = false, lastCheck = 0;
    let controlled = !!navigator.serviceWorker.controller;
    const observed = new WeakSet();
    function show() { if (registration?.waiting || changed) bar.hidden = false; }
    function reload() { if (!reloaded) { reloaded = true; location.reload(); } }
    function observe(worker) {
      if (!worker || observed.has(worker)) return;
      observed.add(worker);
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") show();
      });
    }
    async function check() {
      if (!registration || document.hidden || !navigator.onLine || checkInProgress || Date.now() - lastCheck < 60000) return;
      checkInProgress = true;
      lastCheck = Date.now();
      try { await registration.update(); show(); } catch (_) { /* Retry on reconnect or the next visible check. */ }
      finally { checkInProgress = false; }
    }
    button.addEventListener("click", () => {
      if (requested) return;
      // This click explicitly permits a page refresh; never discard work on an automatic update check.
      requested = true;
      button.disabled = true;
      button.textContent = "Updating…";
      if (changed || !registration?.waiting) { reload(); return; }
      registration.waiting.postMessage({ type: "ACTIVATE_PROVIDER_UPDATE" });
      setTimeout(() => {
        if (reloaded) return;
        requested = false;
        button.disabled = false;
        button.textContent = "Refresh app";
        text.textContent = "The update is taking longer. Check your connection and try again.";
      }, 15000);
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!controlled) { controlled = true; return; }
      changed = true;
      if (requested) reload();
      else show();
    });
    Promise.resolve(registrationPromise).then(value => {
      if (!value) return;
      registration = value;
      registration.addEventListener("updatefound", () => observe(registration.installing));
      observe(registration.installing);
      show();
      void check();
    }).catch(() => {});
    document.addEventListener("visibilitychange", () => void check());
    window.addEventListener("online", () => void check());
    setInterval(() => void check(), 300000);
  }
})();
