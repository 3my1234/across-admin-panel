(function(root){
 'use strict';
 function mount({element,request,getActor,offline}){
  let actor='',enabled=false,timer,flight=null,generation=0,listing='',dead=false;
  element.innerHTML='<h3>Driver availability</h3><p>Go online to appear to nearby customers. Keep this app open. Availability expires within two minutes without an update. Customers see approximate distance; your exact location is shared only when you send a pin.</p><label>Approved driver service<select data-driver-listing><option value="">Load approved driver listings</option></select></label><div class="action-row"><button type="button" data-driver-load class="secondary">Load driver services</button><button type="button" data-driver-online>Available nearby</button><button type="button" data-driver-offline class="secondary">Go offline</button></div><p data-driver-status role="status">Offline</p>';
  const status=message=>element.querySelector('[data-driver-status]').textContent=message;
  const active=(captured,epoch)=>!dead&&enabled&&!document.hidden&&actor===captured&&getActor()===captured&&generation===epoch;
  async function stop(){enabled=false;generation++;clearTimeout(timer);status('Offline on this device · nearby visibility expires within two minutes if the network is unavailable.');const captured=actor;try{await flight;if(captured)await offline(captured);}catch{/* Server lease expires even when offline cannot reach the server. */}}
  async function tick(){if(flight||!active(actor,generation))return;const captured=actor,epoch=generation;
   flight=(async()=>{try{const location=await root.AtlLocation.capture();if(!active(captured,epoch))return;await request('/providers/me/driver-availability',{method:'PUT',body:JSON.stringify({listing_id:listing,...location})});if(active(captured,epoch))status('Available nearby · location updated just now');}catch(error){if(active(captured,epoch)){enabled=false;generation++;status(error.message+' You are offline. Tap Available nearby to retry.');try{await request('/providers/me/driver-availability',{method:'DELETE'});}catch{}}}})();
   try{await flight;}finally{flight=null;if(active(captured,epoch))timer=setTimeout(()=>void tick(),30000);}
  }
  element.querySelector('[data-driver-load]').onclick=async event=>{const button=event.currentTarget;if(button.disabled)return;button.disabled=true;const captured=getActor();try{const data=await request('/providers/me/listings?status=approved&limit=100');if(captured!==getActor())return;const select=element.querySelector('[data-driver-listing]');select.replaceChildren();for(const item of data.items||[]){if(!/driver|chauffeur|taxi/i.test(item.category||''))continue;const option=document.createElement('option');option.value=item.id;option.textContent=item.title;select.append(option);}status(select.options.length?'Choose a service, then tap Available nearby.':'Create a driver service listing and submit it for admin approval first.');}catch(error){status(error.message);}finally{button.disabled=false;}};
  element.querySelector('[data-driver-online]').onclick=()=>{if(enabled||flight)return;listing=element.querySelector('[data-driver-listing]').value;if(!listing)return status('Load and choose an approved driver service first.');actor=getActor();if(!actor)return;enabled=true;generation++;status('Finding your current location…');void tick();};
  element.querySelector('[data-driver-offline]').onclick=()=>void stop();
  const visibility=()=>{if(document.hidden&&enabled)void stop();};document.addEventListener('visibilitychange',visibility);
  const pagehide=()=>{if(enabled)void stop();};window.addEventListener('pagehide',pagehide);window.addEventListener('provider-native-pause',pagehide);
  return {stop,destroy(){void stop();dead=true;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('provider-native-pause',pagehide);}};
 }
 root.DriverAvailability={mount};
})(globalThis);
