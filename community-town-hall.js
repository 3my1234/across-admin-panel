(function(root){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>'₦'+Number(value).toLocaleString('en-NG',{maximumFractionDigits:2});
 const time=value=>new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
 const button=(label,attr,soft=false)=>`<button type="button" class="hall-action${soft?' hall-action-soft':''}" ${attr}>${esc(label)}</button>`;
 const avatar=(name,url)=>`<span class="hall-avatar"><span>${esc((name||'A').slice(0,1).toUpperCase())}</span>${/^https:\/\//.test(url||'')?`<img src="${esc(url)}" alt="" loading="lazy"/>`:''}</span>`;
 const buyer=item=>`<div class="hall-request-top">${avatar(item.buyer_name,item.buyer_avatar_url)}<div><strong>${esc(item.buyer_name||'ATL member')}</strong><small>${esc(time(item.created_at))}</small></div></div>`;
 const metadata=item=>`<div class="hall-chips">${!item.message_only&&item.target_unit_price>0?`<span>${esc(money(item.target_unit_price))} budget</span>`:''}${item.location?`<span class="hall-location">⌖ ${esc(item.location)}</span>`:''}${item.expired?'<span class="hall-status">Expired · no provider response</span>':item.state==='closed'?'<span class="hall-status">Closed request</span>':item.provider_engaged?'<span>Provider engaged</span>':'<span class="hall-status">Available for 24 hours</span>'}</div>`;
 async function mount({element,request,getActor,openChat,roomId=''}){
  const actor=getActor(),epoch={};element.__hallEpoch=epoch;
  let canCreate=false,membershipBusy='',membershipUntil=0,room=null,mine=false,busy=false,cursor='',items=[],creating=false,draft='',createReference=null,offerReference=null,error='',loading=true,pending=null,arrivalIDs=new Set(),known=new Set(),etag='',listFlight=null,sequence=0,destroyed=false,timer,observer;
  const live=()=>!destroyed&&element.__hallEpoch===epoch&&actor===getActor()&&element.isConnected;
  const originalRequest=request;
  request=(path,options={})=>{
   if((path==='/chat/town-hall'||path.endsWith('/offers'))&&options.method==='POST'){
    const payload=JSON.parse(options.body),fingerprint=JSON.stringify(payload),offer=path.endsWith('/offers');let reference=offer?offerReference:createReference;
    if(reference?.fingerprint!==fingerprint)reference={fingerprint,id:crypto.randomUUID()};if(offer)offerReference=reference;else createReference=reference;
    options={...options,body:JSON.stringify({...payload,[offer?'client_message_id':'client_request_id']:reference.id})};
   }return originalRequest(path,options);
  };
  function destroy(){destroyed=true;clearInterval(timer);observer?.disconnect();document.removeEventListener('visibilitychange',foreground);}
  function nearTop(){let parent=element.parentElement;while(parent&&parent!==document.body){if(/auto|scroll/.test(getComputedStyle(parent).overflowY)&&parent.scrollTop>50)return false;parent=parent.parentElement;}return (window.scrollY||0)<60;}
  function editing(){return element.contains(document.activeElement)&&document.activeElement?.matches('input,textarea,select');}
  const run=fn=>event=>{event?.preventDefault();void act(fn,event?.currentTarget);};
  async function act(fn,trigger){if(busy||!live())return;busy=true;const target=trigger?.tagName==='BUTTON'?trigger:trigger?.querySelector('button[type=submit]'),wasDisabled=target?.disabled;if(target){target.disabled=true;target.setAttribute('aria-busy','true');}try{error='';await fn();}catch(e){if(live()){error=e.message||'Please retry';const output=element.querySelector('[data-hall-error]');if(output)output.textContent=error;}}finally{busy=false;if(target){target.disabled=wasDisabled;target.removeAttribute('aria-busy');}}}
  function acceptHead(data,animate){arrivalIDs=animate&&known.size?new Set(data.items.filter(item=>!known.has(item.id)).map(item=>item.id)):new Set();items=data.items;items.forEach(item=>known.add(item.id));if(known.size>500)known=new Set(items.map(item=>item.id));cursor=data.next_cursor||'';pending=null;}
  async function list(older='',background=false){
   if(listFlight?.sequence===sequence)return;const seq=sequence,flight={sequence:seq};listFlight=flight;
   try{const data=await request(`/chat/town-hall?limit=25&mine=${mine}${older?'&cursor='+encodeURIComponent(older):''}`,background&&etag?{headers:{'If-None-Match':etag}}:{});
    if(!live()||seq!==sequence||room||data.unchanged)return;
    canCreate=data.can_create===true;
    if(data._etag&&!older)etag=data._etag;
    if(older){items=[...items,...data.items.filter(item=>!items.some(old=>old.id===item.id))];data.items.forEach(item=>known.add(item.id));cursor=data.next_cursor||'';render();}
    else if(background&&(!nearTop()||editing()||creating)){pending=data;renderQueue();}
    else{acceptHead(data,background);render();}
    loading=false;error='';
   }finally{if(listFlight===flight)listFlight=null;}
  }
  async function detail(id){const seq=++sequence;const data=await request(`/chat/town-hall/${id}`);if(!live()||seq!==sequence)return;room=data;loading=false;pending=null;if(room.admitted&&!room.is_owner&&room.state==='open'){destroy();await openChat(room.id);return;}render();}
  async function change(provider,value){if(Date.now()<membershipUntil)return;if(value==='remove'&&!confirm('Remove this provider from the Town Hall room?'))return;membershipBusy=provider;const buttons=element.querySelectorAll('[data-hall-member]');buttons.forEach(b=>{b.disabled=true;if(b.dataset.hallMember===provider&&b.dataset.action===value)b.textContent=value==='approve'?'Approving...':'Updating...';});try{await request(`/chat/town-hall/${room.id}/providers/${provider}`,{method:'POST',body:JSON.stringify({action:value})});membershipUntil=Date.now()+1200;await detail(room.id);}finally{membershipBusy='';if(live())element.querySelectorAll('[data-hall-member]').forEach(b=>{b.disabled=false;});}}
  function renderQueue(){let target=element.querySelector('[data-hall-new]');if(!target)return;if(!pending){target.replaceChildren();return;}const count=pending.items.filter(item=>!items.some(old=>old.id===item.id)).length;target.innerHTML=button(count?`${count} new request${count===1?'':'s'} · Show latest`:'Feed updated · Show latest','data-hall-latest',true);target.querySelector('button').onclick=()=>{acceptHead(pending,true);render();element.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};}
  function feedCard(item){return `<article class="hall-request${arrivalIDs.has(item.id)?' hall-request-new':''}" data-hall-request="${esc(item.id)}">${buyer(item)}<p class="hall-request-message">${esc(item.description)}</p>${metadata(item)}<footer><span>♧ ${item.offers.length} offer${item.offers.length===1?'':'s'} · ${item.seats>=10?'Full':'Places available'}</span><span class="hall-seat">${item.seats}/10</span>${button('Enter →',`data-hall-detail="${esc(item.id)}"`)}</footer></article>`;}
  function render(){
   if(!live())return;
   element.innerHTML=`<p data-hall-error role="status">${esc(error)}</p>`;
   if(!room){
    const icon=(root.AtlHallIcon||'').replaceAll('atlHallMetal','atlHallHero');
    element.insertAdjacentHTML('beforeend',`<header class="hall-hero"><div><h2>Ask. Meet. Make a deal.</h2><p>${canCreate?'Post what you need. Connect with providers.':'Find customer requests. Join and respond.'}</p></div><span class="hall-hero-icon">${icon}</span></header><div class="community-row hall-filter">${button(mine?'Browse open requests':'My requests','data-hall-mine',true)}${canCreate?button(creating?'Cancel':'＋ Create a request','data-hall-toggle'):''}${button('↻ Refresh','data-hall-refresh',true)}</div><form class="hall-create" data-hall-create ${creating?'':'hidden'}><label for="hall-request-message">What are you looking for?</label><textarea id="hall-request-message" name="message" rows="3" minlength="3" maxlength="2000" required placeholder="I need a ride from Bwari to Central Area. My budget is ₦10,000.">${esc(draft)}</textarea><p>Requests expire after 24 hours, including active discussions. Ending a request removes it from Town Hall. Private chats with selected providers remain.</p><button type="submit" class="hall-action">Post request ↗</button></form><div class="hall-notice"><span aria-hidden="true">◆</span><p>Verified providers with an active paid plan can request entry. You approve up to 10.</p></div><div data-hall-new class="hall-new-queue"></div><div class="hall-feed">${items.map(feedCard).join('')||`<div class="hall-empty"><h3>${loading?'Loading requests…':mine?'Your requests will appear here':'Start a conversation'}</h3><p>Post what you need and let providers come to you.</p></div>`}</div>${cursor?button('More requests','data-hall-more',true):''}`);
    element.querySelector('[data-hall-mine]').onclick=run(async()=>{sequence++;mine=!mine;etag='';pending=null;known.clear();await list();});
    if(canCreate)element.querySelector('[data-hall-toggle]').onclick=()=>{creating=!creating;render();if(creating)element.querySelector('textarea').focus();};
    element.querySelector('[data-hall-refresh]').onclick=run(()=>{etag='';return list();});
    element.querySelector('[data-hall-more]')?.addEventListener('click',run(()=>list(cursor)));
    element.querySelectorAll('[data-hall-detail]').forEach(b=>b.onclick=run(()=>detail(b.dataset.hallDetail)));
    const form=element.querySelector('[data-hall-create]');form.elements.message.oninput=event=>draft=event.target.value;
    form.onsubmit=e=>{e.preventDefault();draft=form.elements.message.value;void act(async()=>{const data=await request('/chat/town-hall',{method:'POST',body:JSON.stringify({message:draft.trim()})});createReference=null;draft='';creating=false;etag='';await detail(data.id);},e.submitter||form);};
    element.querySelectorAll('.hall-avatar img').forEach(img=>img.onerror=()=>img.remove());renderQueue();return;
   }
   element.insertAdjacentHTML('beforeend',`<div class="community-row hall-room-actions">${button('← Back to requests','data-hall-back',true)}${button('↻ Refresh','data-hall-refresh',true)}</div><article class="hall-request hall-room">${buyer(room)}<p class="hall-request-message">${esc(room.description)}</p>${metadata(room)}<p class="community-note">${room.seats}/10 provider places occupied</p>${room.admitted||room.is_owner?button(room.state==='closed'?'▤ View chat record':'Open bargaining chat →','data-hall-chat'):room.state==='open'?room.seats>=10?'<p>Full. A place opens when the buyer removes a provider.</p>':room.application_state==='pending'?'<p>Waiting for buyer approval.</p>':button('Ask to join →','data-hall-apply'):''}${room.expired&&room.is_owner?button('↻ Repost request','data-hall-repost',true):''}</article>
   ${room.is_owner&&room.state==='open'?`<section class="community-card hall-members"><h3>Provider requests</h3>${(room.applications||[]).map(a=>`<div class="hall-application"><strong>${esc(a.name)}</strong><small>${esc(a.state)}</small><div class="community-row">${a.state==='pending'?button('Approve',`data-hall-member="${esc(a.provider_id)}" data-action="approve"`)+button('Decline',`data-hall-member="${esc(a.provider_id)}" data-action="decline"`,true):a.state==='admitted'?button('Remove',`data-hall-member="${esc(a.provider_id)}" data-action="remove"`,true):''}</div></div>`).join('')||'<p>Provider requests to join appear here.</p>'}${button('End this request','data-hall-close',true)}</section>`:''}
   <section class="hall-offers"><h3>Offer previews</h3><p class="community-note">Offers are public. Bargaining stays inside the admitted chat.</p>${room.offers.map(o=>`<article class="hall-offer">${root.ProviderIdentity?.render(o.provider_identity)||`<div class="hall-request-top">${avatar(o.provider_name)}<strong>${esc(o.provider_name)}</strong></div>`}<span class="hall-offer-label">Provider offer</span><strong class="hall-offer-price">${esc(money(o.unit_price))}${room.message_only?'':` per ${esc(room.unit)}`}</strong>${o.terms?`<p class="hall-offer-terms">${esc(o.terms)}</p>`:''}${room.is_owner&&room.state==='open'?button('Continue privately →',`data-hall-choose="${esc(o.id)}"`):''}</article>`).join('')||'<div class="hall-empty"><p>Offers appear here when providers join and respond.</p></div>'}</section>
   ${room.admitted&&!room.is_owner&&room.state==='open'?`<form class="community-card" data-hall-offer><h3>Make an offer</h3><label>${room.message_only?'Offer amount, NGN':'Price per unit, NGN'}<input name="unit_price" type="number" min="0.01" step="0.01" required/></label><label>Tell the buyer what you can offer<textarea name="terms" maxlength="1000" rows="3"></textarea></label><button type="submit" class="hall-action">Publish offer</button><p>An active paid plan is required to send offers and messages.</p></form>`:''}`);
   element.querySelector('[data-hall-back]').onclick=run(async()=>{sequence++;room=null;etag='';await list();});
   element.querySelectorAll('.hall-avatar img').forEach(img=>img.onerror=()=>img.remove());
   element.querySelector('[data-hall-refresh]').onclick=run(()=>detail(room.id));
   element.querySelector('[data-hall-chat]')?.addEventListener('click',run(()=>openChat(room.id)));
   element.querySelector('[data-hall-repost]')?.addEventListener('click',()=>{draft=room.description;room=null;mine=false;creating=true;createReference=null;etag='';sequence++;render();element.querySelector('textarea').focus();});
   element.querySelector('[data-hall-apply]')?.addEventListener('click',run(async()=>{await request(`/chat/town-hall/${room.id}/apply`,{method:'POST'});await detail(room.id);}));
   element.querySelectorAll('[data-hall-member]').forEach(b=>b.onclick=run(()=>change(b.dataset.hallMember,b.dataset.action)));
   element.querySelector('[data-hall-close]')?.addEventListener('click',event=>{if(confirm('End this request? It disappears publicly; you retain the record and private chats stay open.'))void act(async()=>{await request(`/chat/town-hall/${room.id}/close`,{method:'POST'});await detail(room.id);},event.currentTarget);});
   element.querySelectorAll('[data-hall-choose]').forEach(b=>b.onclick=event=>{if(confirm('Open a private chat and close this Town Hall request?'))void act(async()=>{const data=await request(`/chat/town-hall/${room.id}/choose`,{method:'POST',body:JSON.stringify({offer_id:b.dataset.hallChoose,close_room:true})});await openChat(data.id);},event.currentTarget);});
   element.querySelector('[data-hall-offer]')?.addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;void act(async()=>{await request(`/chat/town-hall/${room.id}/offers`,{method:'POST',body:JSON.stringify({unit_price:Number(form.elements.unit_price.value),terms:form.elements.terms.value})});offerReference=null;await detail(room.id);},e.submitter||form);});
  }
  async function refresh(background=false){if(!live()){destroy();return;}if(busy||editing()||creating)return;try{if(room){if(!background||room.application_state==='pending')await detail(room.id);}else await list('',background);}catch(e){if(live()){error=e.message||'Please retry';const target=element.querySelector('[data-hall-error]');if(target)target.textContent=error;}}}
  function foreground(){if(!document.hidden)void refresh(true);}
  render();try{if(roomId)await detail(roomId);else await list();loading=false;if(live()&&!room)render();}catch(e){loading=false;error=e.message||'Please retry';if(live())render();}
  if(live()){timer=setInterval(()=>{if(!live())return destroy();if(!document.hidden&&(!room||room.application_state==='pending'))void refresh(true);},10000);document.addEventListener('visibilitychange',foreground);observer=new MutationObserver(()=>{if(!live())destroy();});observer.observe(document.body,{childList:true,subtree:true});}
  return {refresh,destroy};
 }
 root.CommunityTownHall={mount};
})(typeof window!=='undefined'?window:globalThis);
