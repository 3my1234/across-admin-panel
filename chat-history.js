(() => {
 window.PortalChatHistory={merge(current,incoming){
  const valid=url=>{const stamp=url.match(/[?&]X-Amz-Date=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/),expiry=url.match(/[?&]X-Amz-Expires=(\d+)/);return stamp&&expiry&&Date.UTC(+stamp[1],+stamp[2]-1,+stamp[3],+stamp[4],+stamp[5],+stamp[6])+(+expiry[1])*1000>Date.now()+90000;};
  const items=new Map(current.map(item=>[item.id,item]));for(const message of incoming){const old=items.get(message.id);items.set(message.id,old?.media_urls?.length&&old.media_urls.length===message.media_urls?.length&&old.media_urls.every(valid)?{...message,media_urls:old.media_urls}:message);}return [...items.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 },create(limit=10,ttl=300000){
  let owner="";const entries=new Map();
  return {
   get(actor,id){if(owner!==actor){entries.clear();owner=actor;}const item=entries.get(id);if(!item)return null;if(Date.now()-item.saved>ttl){entries.delete(id);return null;}entries.delete(id);entries.set(id,item);return {...item,messages:[...item.messages]};},
   put(actor,id,messages,cursor=""){if(owner!==actor)return;if(!messages.length||messages.length>200){entries.delete(id);return;}entries.delete(id);entries.set(id,{messages:[...messages],cursor,saved:Date.now()});while(entries.size>limit)entries.delete(entries.keys().next().value);},
   clear(){owner="";entries.clear();}
  };
 }};
})();
