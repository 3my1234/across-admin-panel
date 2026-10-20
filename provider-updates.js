(() => {
  "use strict";
  window.ProviderAppUpdates = { watch };
  function watch(registrationPromise) {
    if (!("serviceWorker" in navigator)) return;
    const bar = document.createElement("dialog");
    bar.className = "provider-update-dialog";
    bar.setAttribute("role", "alertdialog");
    bar.setAttribute("aria-labelledby", "providerUpdateTitle");
    bar.setAttribute("aria-describedby", "providerUpdateDescription");
    bar.hidden = true;
    const heading = document.createElement("h2");
    heading.id = "providerUpdateTitle";
    heading.textContent = "An app update is ready";
    const text = document.createElement("span");
    text.id = "providerUpdateDescription";
    text.textContent = "Update now to load the latest version. Finish sending messages or saving changes first, or choose Later to keep working.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Update now";
    const later = document.createElement("button");
    later.type = "button";
    later.className = "secondary";
    later.textContent = "Later";
    bar.append(heading, text, button, later);
    document.body.prepend(bar);
    let registration, requested = false, changed = false, reloaded = false, checkInProgress = false, lastCheck = 0, dismissed = false, announcedWorker;
    let controlled = !!navigator.serviceWorker.controller;
    const observed = new WeakSet();
    function show() {
      if (!registration?.waiting && !changed) return;
      if (registration?.waiting && announcedWorker !== registration.waiting) { announcedWorker = registration.waiting; dismissed = false; }
      if (dismissed) return;
      bar.hidden = false;
      if (!bar.open) bar.showModal();
    }
    function dismiss() { if (requested) return; dismissed = true; bar.close(); bar.hidden = true; }
    later.addEventListener("click", dismiss);
    bar.addEventListener("cancel", event => { event.preventDefault(); dismiss(); });
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
      later.disabled = true;
      button.textContent = "Updating…";
      if (changed || !registration?.waiting) { reload(); return; }
      registration.waiting.postMessage({ type: "ACTIVATE_PROVIDER_UPDATE" });
      setTimeout(() => {
        if (reloaded) return;
        requested = false;
        button.disabled = false;
        later.disabled = false;
        button.textContent = "Update now";
        text.textContent = "The update is taking longer. Check your connection and try again.";
      }, 15000);
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!controlled) { controlled = true; return; }
      changed = true;
      dismissed = false;
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
