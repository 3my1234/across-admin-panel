(() => {
  "use strict";
  const key="atl.appearance.v1", root=document.documentElement;
  const system=window.matchMedia("(prefers-color-scheme: dark)");
  let preference="system";
  const bound=new WeakSet();
  try { const saved=localStorage.getItem(key); if(["system","light","dark"].includes(saved))preference=saved; } catch (_) {}
  function apply(){
    root.dataset.theme=preference==="system" ? (system.matches ? "dark" : "light") : preference;
    root.style.colorScheme=root.dataset.theme;
    syncControls();
  }
  function syncControls(){
    document.querySelectorAll("[data-theme-preference]").forEach(select=>{
      select.value=preference;
      select.dataset.themeReady="true";
      if(bound.has(select))return;
      bound.add(select);
      select.addEventListener("change",()=>{
        if(!["system","light","dark"].includes(select.value))return;
        const previous=preference;preference=select.value;
        try{localStorage.setItem(key,preference);}catch(_){preference=previous;alert("Your appearance preference could not be saved. Please try again.");}
        apply();
      });
    });
  }
  apply();
  // Parser-created controls are synchronized at a microtask, before rendering,
  // instead of waiting for slower deferred scripts and DOMContentLoaded.
  if(typeof MutationObserver!=="undefined")new MutationObserver(syncControls).observe(root,{childList:true,subtree:true});
  system.addEventListener("change",()=>{if(preference==="system")apply();});
  document.addEventListener("DOMContentLoaded",()=>{
    apply();
  });
  window.addEventListener("storage",event=>{if(event.key===key){preference=["system","light","dark"].includes(event.newValue) ? event.newValue : "system";apply();}});
})();

// Shared by admin and provider pages, including forms inside dialogs.
(() => {
  const viewport = window.visualViewport;
  let revealTimer;
  function revealFocusedField() {
    const field = document.activeElement;
    if (!field?.matches("input:not([type=checkbox]):not([type=radio]),textarea,select")) return;
    // Full-screen chats already size themselves to the visual viewport. A
    // second scroll-to-centre lifts the composer away from the keyboard.
    if (field.closest?.('.community-room-open, #conversationDialog[open]')) return;
    const bounds = field.getBoundingClientRect();
    const top = viewport?.offsetTop || 0;
    const bottom = top + (viewport?.height || window.innerHeight);
    if (bounds.bottom > bottom - 64 || bounds.top < top + 12) field.scrollIntoView({block:"center",behavior:"auto"});
  }
  function updateViewport() {
    document.documentElement.style.setProperty("--visible-viewport-height", `${viewport?.height || window.innerHeight}px`);
    document.documentElement.style.setProperty("--visible-viewport-top", `${viewport?.offsetTop || 0}px`);
    clearTimeout(revealTimer);
    revealTimer = setTimeout(revealFocusedField, 80);
  }
  viewport?.addEventListener("resize", updateViewport);
  viewport?.addEventListener("scroll", () => {
    document.documentElement.style.setProperty("--visible-viewport-top", `${viewport?.offsetTop || 0}px`);
  });
  // Scrolling must not force focus back into view: that traps users at a form
  // and can interfere with long-page screenshots. Focus/resize handles keyboards.
  window.addEventListener("resize", updateViewport);
  document.addEventListener("focusin", () => { clearTimeout(revealTimer); revealTimer=setTimeout(revealFocusedField,350); });
  document.addEventListener("DOMContentLoaded", updateViewport);
})();
