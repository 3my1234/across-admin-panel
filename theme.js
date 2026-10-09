(() => {
  "use strict";
  const key="atl.appearance.v1", root=document.documentElement;
  const system=window.matchMedia("(prefers-color-scheme: dark)");
  let preference="system";
  try { const saved=localStorage.getItem(key); if(["system","light","dark"].includes(saved))preference=saved; } catch (_) {}
  function apply(){
    root.dataset.theme=preference==="system" ? (system.matches ? "dark" : "light") : preference;
    root.style.colorScheme=root.dataset.theme;
    document.querySelectorAll("[data-theme-preference]").forEach(select=>{select.value=preference;});
  }
  apply();
  system.addEventListener("change",()=>{if(preference==="system")apply();});
  document.addEventListener("DOMContentLoaded",()=>{
    apply();
    document.querySelectorAll("[data-theme-preference]").forEach(select=>select.addEventListener("change",()=>{
      if(!["system","light","dark"].includes(select.value))return;
      const previous=preference; preference=select.value;
      try{localStorage.setItem(key,preference);}catch(_){preference=previous;alert("Your appearance preference could not be saved. Please try again.");}
      apply();
    }));
  });
  window.addEventListener("storage",event=>{if(event.key===key){preference=["system","light","dark"].includes(event.newValue) ? event.newValue : "system";apply();}});
})();
