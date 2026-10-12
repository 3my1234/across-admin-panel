(() => {
  const escape=value=>String(value ?? "").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const value=item=>item==null?"Not set":typeof item==="boolean"?(item?"Yes":"No"):typeof item==="object"?JSON.stringify(item,null,2):String(item);
  const display=(field,item)=>field==="media_urls"&&Array.isArray(item)?`<p>${item.length} photos</p><div class="moderation-media">${item.filter(url=>typeof url==="string"&&/^https?:\/\//i.test(url)).slice(0,10).map(url=>`<img class="product-image" src="${escape(url)}" alt="Listing photo" loading="lazy">`).join("")}</div>`:`<pre>${escape(value(item))}</pre>`;
  function render(item){
    if(!item.has_approved_baseline)return item.published_at?'<p class="muted">Previously published. Earlier approved content was not recorded; review the full listing.</p>':'<p class="muted">New listing — first approval.</p>';
    const changes=item.changes_since_approval || [];
    if(!changes.length)return '<p class="muted">No differences from the last approved version.</p>';
    return `<details class="listing-change-review"><summary>${changes.length} ${changes.length===1?"change":"changes"} since last approval — view changes</summary><div class="listing-change-list">${changes.map(change=>`<section><strong>${escape(change.label)}</strong><div class="listing-change-values"><div><small>Last approved</small>${display(change.field,change.before)}</div><div><small>Submitted now</small>${display(change.field,change.after)}</div></div></section>`).join("")}</div></details>`;
  }
  window.ListingReview={render};
})();
