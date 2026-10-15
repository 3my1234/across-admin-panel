(function(root){
 'use strict';
 const valid=id=>/^[a-f0-9-]{36}$/i.test(id||'');
 function graphic(status){return `<svg width="18" height="16" viewBox="0 0 22 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2 9 4 4L16 3"/>${status==='sent'?'':'<path d="m10 12 2 2L22 4"/>'}</svg>`;}
 function render(id,mine,group=false){if(!mine||!valid(id))return '';return `<span class="message-receipt" data-message-receipt="${id}" data-receipt-group="${group?'true':'false'}" data-state="sent" aria-label="Sent to Atlantic Express">${group?'Sent':graphic('sent')}</span>`;}
 function create({request,getActor,admin=false,provider=false}){
  let actor='',alive=true,privacyVersion=0,previewBusy=false;const previews=new Map(),threads=new Map(),delivered=new Set(),read=new Set(),states=new Map(),viewed=new Set(),watched=new Map();
  const blocked=()=>document.hidden||!!document.querySelector('dialog[open]');
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries){const id=entry.target.dataset.receiptMessage;const item=watched.get(id);if(!item||item.node!==entry.target)continue;clearTimeout(item.timer);if(entry.isIntersecting&&entry.intersectionRatio>=.5){item.timer=setTimeout(()=>{if(!blocked()&&item.node.isConnected){viewed.add(id);void poll();}},750);}else viewed.delete(id);}},{threshold:[0,.5,1]}):null;
  const modalObserver=typeof MutationObserver==='function'?new MutationObserver(()=>{for(const item of watched.values()){clearTimeout(item.timer);observer?.unobserve(item.node);}watched.clear();viewed.clear();if(alive)requestAnimationFrame(watch);}):null;
  modalObserver?.observe(document.body,{attributes:true,attributeFilter:['open'],subtree:true});
  function reset(){privacyVersion++;actor=getActor();previews.clear();threads.clear();delivered.clear();read.clear();states.clear();viewed.clear();for(const item of watched.values())clearTimeout(item.timer);watched.clear();observer?.disconnect();paint();}
  function paint(){for(const node of document.querySelectorAll('[data-message-receipt]')){const state=states.get(node.dataset.messageReceipt),status=state?.status||'sent',group=node.dataset.receiptGroup==='true',signature=JSON.stringify([status,state?.delivered_count||0,state?.read_count||0,group]);if(node.dataset.receiptSignature===signature)continue;node.dataset.receiptSignature=signature;node.dataset.state=status;node.setAttribute('aria-label',group?`Delivered to ${state?.delivered_count||0}, seen by ${state?.read_count||0}`:status==='read'?'Read':status==='delivered'?'Delivered to recipient':'Sent to Atlantic Express');node.innerHTML=group?(state?.read_count?`Seen by ${state.read_count}`:state?.delivered_count?`Delivered to ${state.delivered_count}`:'Sent'):graphic(status);}}
  function watch(){for(const node of document.querySelectorAll('[data-receipt-message]')){const id=node.dataset.receiptMessage;if(!valid(id)||watched.get(id)?.node===node)continue;const old=watched.get(id);if(old){clearTimeout(old.timer);observer?.unobserve(old.node);viewed.delete(id);}watched.set(id,{node,timer:null});observer?.observe(node);}for(const[id,item]of watched){if(!item.node.isConnected){clearTimeout(item.timer);observer?.unobserve(item.node);watched.delete(id);viewed.delete(id);}}}
  const visible=thread=>thread.ids.some(id=>{const node=watched.get(id)?.node;return node&&node.isConnected&&node.getClientRects().length>0;});
  async function sync(thread){
   const captured=actor;if(!alive||!captured||captured!==getActor()||thread.busy||document.hidden||!visible(thread))return;thread.busy=true;
   const version=privacyVersion;const current=()=>alive&&version===privacyVersion&&captured===actor&&captured===getActor();const base={channel:thread.channel,conversation_id:thread.room};
   try{
    const delivery=thread.incoming.filter(id=>!delivered.has(id)).slice(0,100);
    if(delivery.length){await request('/messaging/receipts',{method:'POST',body:JSON.stringify({...base,message_ids:delivery,read:false})});if(!current())return;delivery.forEach(id=>delivered.add(id));}
    const seen=blocked()?[]:thread.incoming.filter(id=>viewed.has(id)&&!read.has(id)&&watched.get(id)?.node.getClientRects().length>0).slice(0,100);
    if(seen.length){await request('/messaging/receipts',{method:'POST',body:JSON.stringify({...base,message_ids:seen,read:true})});if(!current())return;seen.forEach(id=>read.add(id));}
    if(thread.ids.length){const data=await request('/messaging/receipts?'+new URLSearchParams({...base,message_ids:thread.ids.slice(-100).join(',')}));if(!current())return;for(const[id,value]of Object.entries(data.items||{}))if(valid(id))states.set(id,value);paint();}
   }catch{/* Receipts must never block chat or replay a message send. */}finally{thread.busy=false;}
  }
  async function deliverPreviews(){if(previewBusy)return;previewBusy=true;const captured=actor;try{const batch=[...previews.values()].filter(item=>!delivered.has(item.last_message_id)).slice(0,100);if(batch.length){await request('/messaging/deliveries',{method:'POST',body:JSON.stringify({messages:batch.map(item=>({channel:item.source==='legacy'?'business':'shared',conversation_id:item.id,message_id:item.last_message_id}))})});if(alive&&captured===getActor())batch.forEach(item=>delivered.add(item.last_message_id));}}catch{/* No retries of messages; only metadata will sync next time. */}finally{previewBusy=false;}}
  async function poll(){if(!alive)return;if(actor!==getActor())reset();if(!actor||document.hidden)return;void deliverPreviews();watch();for(const thread of threads.values())if(visible(thread))void sync(thread);}
  function observe(path,data,captured){
   if(!alive||captured!==getActor())return;if(actor!==captured)reset();
   if(/\/chat\/inbox(?:\?|$)/.test(path)&&Array.isArray(data?.items)){for(const item of data.items)if(item.last_message&&item.last_message_is_mine===false&&valid(item.id)&&valid(item.last_message_id))previews.set(item.last_message_id,item);if(previews.size>100)for(const id of [...previews.keys()].slice(0,previews.size-100))previews.delete(id);void poll();return;}
   const match=path.match(/\/(support\/tickets|chat\/conversations|marketplace\/conversations|providers\/me\/conversations)\/([a-f0-9-]{36})\/messages(?:\?|$)/i);if(!match)return;
   const messages=data?.messages||data?.items;if(!Array.isArray(messages))return;
   const channel=match[1]==='support/tickets'?'support':data.kind?'shared':'business',key=channel+':'+match[2];
   const previous=threads.get(key),ids=[...new Set([...(previous?.ids||[]),...messages.map(m=>m.id).filter(valid)])].slice(-200);
   const mine=m=>typeof m.is_mine==='boolean'?m.is_mine:channel==='support'?m.sender_type===(admin?'admin':'user'):m.sender_type===(provider?'provider':'buyer');
   const thread=previous||{busy:false};Object.assign(thread,{channel,room:match[2],ids,incoming:[...new Set([...(previous?.incoming||[]),...messages.filter(m=>!mine(m)).map(m=>m.id).filter(valid)])].slice(-200)});threads.set(key,thread);
   if(threads.size>10)threads.delete(threads.keys().next().value);
   requestAnimationFrame(()=>{if(captured===getActor()){watch();paint();void poll();}});
  }
  async function preferences(){if(!getActor())throw Error('Sign in to change read receipts.');if(actor!==getActor())reset();return request('/messaging/preferences');}
  async function savePreference(enabled){const captured=getActor();const data=await request('/messaging/preferences',{method:'PATCH',body:JSON.stringify({read_receipts_enabled:enabled})});if(captured!==getActor())throw Error('Session changed');privacyVersion++;states.clear();read.clear();paint();void poll();return data;}
  const timer=setInterval(()=>void poll(),5000),foreground=()=>{if(!document.hidden)void poll();};document.addEventListener('visibilitychange',foreground);
  return {observe,preferences,savePreference,reset,destroy(){alive=false;clearInterval(timer);modalObserver?.disconnect();document.removeEventListener('visibilitychange',foreground);reset();}};
 }
 root.AtlMessageReceipts={create,render};
})(globalThis);
