(() => {
  "use strict";
  const entry = document.getElementById("providerInstallEntry");
  const legacy = document.getElementById("installProviderApp");
  const buttons = [...document.querySelectorAll("[data-provider-install]"), legacy].filter(Boolean);
  const standalone = window.matchMedia("(display-mode: standalone)");
  let deferred, installed = false, busy = false;
  const guide = document.createElement("dialog");
  guide.className = "provider-install-dialog";
  guide.setAttribute("aria-labelledby", "providerInstallTitle");
  const heading = document.createElement("h2");
  heading.id = "providerInstallTitle";
  heading.textContent = "Install Atlantic Express";
  const instructions = document.createElement("p");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Got it";
  close.addEventListener("click", () => guide.close());
  guide.append(heading, instructions, close);
  document.body.append(guide);
  function refresh() {
    const hidden = installed || standalone.matches || navigator.standalone === true || window.ProviderNativeBridge?.embedded() === true;
    entry.hidden = hidden;
    legacy?.classList.toggle("hidden", hidden);
    if (hidden && guide.open) guide.close();
  }
  function explain() {
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      instructions.textContent = "Open your browser’s Share menu, choose Add to Home Screen, then Add. You can install before creating an account.";
    } else if (/Android/.test(navigator.userAgent)) {
      instructions.textContent = "Open your browser’s menu (⋮ or ☰), choose Install app or Add to Home screen, then confirm. If that option is missing, open this page in Chrome or Samsung Internet. You can install before creating an account.";
    } else {
      instructions.textContent = "Choose the install icon in your browser’s address bar, or Install app in its menu. You can also keep using Atlantic Express in this browser.";
    }
    if (!guide.open) guide.showModal();
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferred = event;
    refresh();
  });
  window.addEventListener("appinstalled", () => { installed = true; deferred = null; refresh(); });
  standalone.addEventListener?.("change", refresh);
  for (const button of buttons) button.addEventListener("click", async () => {
    if (busy) return;
    if (!deferred) { explain(); return; }
    busy = true;
    buttons.forEach(item => { item.disabled = true; });
    const prompt = deferred;
    deferred = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch (_) { explain(); }
    finally { busy = false; buttons.forEach(item => { item.disabled = false; }); refresh(); }
  });
  refresh();
})();
