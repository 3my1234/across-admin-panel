(function(root){
  "use strict";
  const finishes={bronze:["#713C24","#E8B18D","#A15E3B"],silver:["#657482","#F2F7FC","#9EAAB6"],gold:["#96700D","#FFE79A","#DCA82B"],diamond:["#759FC0","#F0FFFF","#CABFF2"],neutral:["#65736D","#9CA9A3","#65736D"]};
  const seal=Array.from({length:145},(_,i)=>{const a=i*Math.PI*2/144,r=13.5+1.15*Math.cos(a*12);return `${i?"L":"M"}${(16+r*Math.cos(a)).toFixed(2)},${(16+r*Math.sin(a)).toFixed(2)}`;}).join(" ")+" Z";
  const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let sequence=0;
  function render(identity,{animate=false}={}) {
    if(!identity?.name)return "";
    const tier=identity.verified&&identity.paid_active&&["bronze","silver","gold","diamond"].includes(identity.tier)?identity.tier:"neutral";
    const colors=finishes[tier],id=`provider-seal-${++sequence}`;
    const label=identity.label || ("Verified provider - " + (tier!=="neutral" ? tier[0].toUpperCase()+tier.slice(1)+" subscription" : "Free plan"));
    let avatar="";
    try {const url=new URL(identity.avatar_url,location.origin);if(identity.avatar_url && (url.protocol==="https:" || (url.origin===location.origin && url.pathname.startsWith("/api/v1/public/images/view/"))))avatar=`<img class="provider-avatar" src="${escape(url.href)}" loading="lazy" decoding="async" alt="" />`;}catch{}
    if(!avatar)avatar=`<span class="provider-avatar provider-avatar-fallback" aria-hidden="true">${escape(identity.name.slice(0,1).toUpperCase())}</span>`;
    const explanation="Badge colour indicates subscription tier, not service quality or a payment guarantee.";
    const badge=identity.verified?`<button type="button" class="provider-seal" title="${escape(label)}. ${explanation}" aria-label="${escape(label)}. ${explanation}" data-provider-badge="${escape(label)}"><svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="${id}-metal" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset=".48" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient><linearGradient id="${id}-shine"><stop stop-color="white" stop-opacity="0"/><stop offset=".5" stop-color="white" stop-opacity=".4"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><clipPath id="${id}-clip"><path d="${seal}"/></clipPath></defs><path d="${seal}" fill="url(#${id}-metal)" stroke="${colors[0]}" stroke-width=".5"/>${animate&&tier!=="neutral"?`<g clip-path="url(#${id}-clip)"><rect class="provider-seal-shimmer" width="24" height="32" fill="url(#${id}-shine)"/></g>`:""}<path d="M9.5 16.2 L14 20.5 L22.5 11.5" fill="none" stroke="${tier==="bronze"?"white":"#20332C"}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`:"";
    return `<span class="provider-identity">${avatar}<span class="provider-name">${escape(identity.name)}</span>${badge}</span>`;
  }
  if(typeof document!=="undefined")document.addEventListener("click",event=>{const badge=event.target.closest?.("[data-provider-badge]");if(badge)alert(`${badge.dataset.providerBadge}\nDocuments approved by Atlantic Express. Badge colour indicates subscription tier, not service quality or a payment guarantee.`);});
  function banner(identity){try{const url=new URL(identity?.banner_url,location.origin);if(identity?.banner_url&&(url.protocol==='https:'||(url.origin===location.origin&&url.pathname.startsWith('/api/v1/public/images/view/'))))return '<img class="provider-business-banner" src="'+escape(url.href)+'" alt="'+escape(identity.name||'Provider')+' business banner" loading="lazy" decoding="async"/>';}catch{}return '';}
  root.ProviderIdentity={render,banner};
})(typeof window!=="undefined"?window:globalThis);
