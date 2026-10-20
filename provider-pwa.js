(() => {
 const embedded=window.ProviderNativeBridge?.embedded()===true;
 let registration;
 function registerWorker(){if(!registration)registration=!embedded&&"serviceWorker" in navigator?navigator.serviceWorker.register("./provider-sw.js",{updateViaCache:"none"}):Promise.resolve(null);return registration;}
 registerWorker();
 registration.catch(()=>{});
 window.ProviderAppUpdates?.watch(registration);
 const notify=document.getElementById("enableProviderNotifications"),notice=document.getElementById("providerPushStatus");
 const token=()=>localStorage.getItem("atlantic.provider.token") || "";let key="",owner="",syncing=false,lastAttempt=0,lastSuccess=0,attemptActor="";
 async function bounded(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Phone notifications could not connect. Tap Retry phone notifications.')),12000);})]);}finally{clearTimeout(timer);}}
 const API="https://api.atlxpres.com/api/v1";
 async function pushAPI(path,options={},actor=token()) {const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(`${API}/notifications/web-push${path}`,{cache:"no-store",...options,headers:{Authorization:`Bearer ${actor}`,"Content-Type":"application/json"},signal:controller.signal});const data=response.status===204?{}:await response.json();if(!response.ok)throw Error(data.message || "Phone notifications could not be enabled. Please retry.");return data;}finally{clearTimeout(timer);}}
 const toBytes=value=>Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4)),char=>char.charCodeAt(0));
 async function subscribe(actor) {
  const worker=await bounded(registerWorker());await bounded(navigator.serviceWorker.ready);if(!worker || actor!==token())return;
  let subscription=await bounded(worker.pushManager.getSubscription());
  const expected=toBytes(key),actual=subscription?new Uint8Array(subscription.options.applicationServerKey || []):new Uint8Array();
  if(subscription && (actual.length!==expected.length || !actual.every((value,index)=>value===expected[index]))){await subscription.unsubscribe();subscription=null;}
  if(!subscription)subscription=await bounded(worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes(key)}));
  if(actor!==token()){await subscription.unsubscribe();return;}
  await pushAPI("",{method:"POST",body:JSON.stringify(subscription)},actor);
  if(actor!==token())return;
  owner=actor;lastSuccess=Date.now();notify.textContent="Check phone notifications";notice.textContent="Phone notifications are connected. Your browser and phone notification settings control banners and sound.";
 }
 async function setup(force=false) {
  if(embedded){notice.textContent='You are using the provider workspace inside Atl.';return;}
  const actor=token();if(!actor||syncing)return;if(!force&&actor===owner&&Date.now()-lastSuccess<300000)return;if(!force&&actor===attemptActor&&Date.now()-lastAttempt<30000)return;if(!("PushManager" in window)||!("Notification" in window)){notice.textContent="For phone notifications on iPhone, install this app from the Share menu first.";return;}
  syncing=true;lastAttempt=Date.now();attemptActor=actor;
  try {const cfg=await pushAPI("/key",{},actor);if(actor!==token())return;if(!cfg.enabled){notice.textContent="Phone notifications are not available yet.";return;}key=cfg.public_key;notify.classList.remove("hidden");if(Notification.permission==="granted")await subscribe(actor);else{notify.textContent="Enable phone notifications";notice.textContent=Notification.permission==="denied"?"Phone notifications are blocked. Allow notifications for this site in your browser and phone settings.":"Enable phone notifications to receive alerts when this app is closed.";}}
  catch(error){if(actor===token()){owner="";registration=null;notify.classList.remove("hidden");notify.textContent="Retry phone notifications";notice.textContent="Phone notifications could not connect. Reconnect and tap Retry phone notifications.";}}
  finally{syncing=false;if(actor!==token() && token())void setup();}
 }
 notify.addEventListener("click",async()=>{const actor=token();if(!actor||syncing)return;notify.disabled=true;try{const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();if(actor!==token())return;if(permission!=="granted"){notice.textContent="Allow notifications in your phone/browser settings to receive new messages.";return;}await setup(true);}catch{if(actor===token())notice.textContent="Phone notifications could not connect. Check your browser notification settings and retry.";}finally{notify.disabled=false;}});
 window.ProviderPWA={disconnect(actor){owner="";key="";lastAttempt=0;lastSuccess=0;notify.classList.add("hidden");notice.textContent="";void registerWorker().then(async worker=>{const subscription=await worker?.pushManager?.getSubscription();if(subscription){await pushAPI("",{method:"DELETE",body:JSON.stringify({endpoint:subscription.endpoint})},actor).catch(()=>{});await subscription.unsubscribe();}}).catch(()=>{});}};
 new MutationObserver(()=>void setup()).observe(document.body,{attributes:true,attributeFilter:["class"]});void setup();
 window.addEventListener("online",()=>void setup());document.addEventListener("visibilitychange",()=>{if(!document.hidden)void setup();});setInterval(()=>{if(!document.hidden&&navigator.onLine!==false)void setup();},30000);
 const nav=document.createElement("nav");nav.className="provider-mobile-nav";nav.setAttribute("aria-label","Provider app navigation");
 const source=document.querySelector(".side-card nav");
 const more=document.createElement("dialog");more.className="provider-more-menu";more.setAttribute("aria-label","Business tools");
 const heading=document.createElement("h2");heading.textContent="Your business";more.append(heading);
 const close=document.createElement("button");close.type="button";close.textContent="Close";close.onclick=()=>more.close();more.append(close);
 const navIcons={overview:'<path d="m3 10 9-7 9 7v11H3Z M9 21v-8h6v8"/>',listings:'<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',messages:'<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/>',support:'<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v8H3Zm14 0h4v8h-4Zm4 7c0 3-4 3-7 3"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'};
 for(const [view,label] of [["overview","Home"],["listings","Listings"],["messages","Chats"],["support","Support"],["more","More"]]) {
  const button=document.createElement("button");button.type="button";button.dataset.mobileView=view;button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+navIcons[view]+'</svg><span>'+label+'</span>';
  button.onclick=()=>{if(view==="more"){sync();more.showModal();history.pushState({...history.state,providerMore:true},"",location.href);}else source.querySelector(`[data-view="${button.dataset.mobileView}"]`)?.click();};nav.append(button);
 }
 function sync(){
  for(const button of nav.querySelectorAll("button")) {
   if(button.textContent==='Listings'){button.dataset.mobileView=source.querySelector('[data-view="listings"]').classList.contains('hidden')?'products':'listings';}
   const active=source.querySelector(`[data-view="${button.dataset.mobileView}"]`)?.classList.contains("active");button.classList.toggle("active",!!active);button.setAttribute("aria-current",active?"page":"false");
  }
  more.querySelectorAll("[data-tool]").forEach(button=>button.remove());
  for(const original of source.querySelectorAll("[data-view]")){if(original.classList.contains("hidden"))continue;const button=document.createElement("button");button.type="button";button.dataset.tool=original.dataset.view;button.textContent=original.textContent;button.onclick=()=>{original.click();more.close();};more.append(button);}
 }
 document.body.append(nav,more);new MutationObserver(sync).observe(source,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});sync();
 more.addEventListener("close",()=>{if(history.state?.providerMore)history.back();});window.addEventListener("popstate",()=>{if(more.open)more.close();});
 const offline=document.createElement("p");offline.className="provider-offline-bar";offline.setAttribute("role","status");offline.textContent="You are offline. Reconnect to send messages or save changes.";document.body.prepend(offline);
 function connection(){offline.hidden=navigator.onLine;}
 window.addEventListener("online",connection);window.addEventListener("offline",connection);connection();
 const viewport=window.visualViewport;
 function keyboard(){document.body.classList.toggle("provider-keyboard-open",!!viewport&&window.innerHeight-viewport.height>150);}
 viewport?.addEventListener("resize",keyboard);document.addEventListener("focusout",()=>setTimeout(keyboard,100));
 if(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.matchMedia("(display-mode: standalone)").matches){const tip=document.createElement("p");tip.className="provider-install-tip";tip.textContent="Add to your Home Screen from the browser Share menu to use the provider app.";document.querySelector("#authPanel").append(tip);}
})();
