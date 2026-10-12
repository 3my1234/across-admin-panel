(() => {
 const install=document.getElementById("installProviderApp");let prompt=null;
 const registration="serviceWorker" in navigator?navigator.serviceWorker.register("./provider-sw.js",{updateViaCache:"none"}):Promise.resolve(null);
 registration.catch(()=>{});
 const notify=document.getElementById("enableProviderNotifications"),notice=document.getElementById("providerPushStatus");
 const token=()=>localStorage.getItem("atlantic.provider.token") || "";let key="",owner="",syncing=false;
 const API="https://api.atlxpres.com/api/v1";
 async function pushAPI(path,options={},actor=token()) {const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(`${API}/notifications/web-push${path}`,{cache:"no-store",...options,headers:{Authorization:`Bearer ${actor}`,"Content-Type":"application/json"},signal:controller.signal});const data=response.status===204?{}:await response.json();if(!response.ok)throw Error(data.message || "Phone notifications could not be enabled. Please retry.");return data;}finally{clearTimeout(timer);}}
 const toBytes=value=>Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4)),char=>char.charCodeAt(0));
 async function subscribe(actor) {
  const worker=await registration;await navigator.serviceWorker.ready;if(!worker || actor!==token())return;
  let subscription=await worker.pushManager.getSubscription();
  const expected=toBytes(key),actual=subscription?new Uint8Array(subscription.options.applicationServerKey || []):new Uint8Array();
  if(subscription && (actual.length!==expected.length || !actual.every((value,index)=>value===expected[index]))){await subscription.unsubscribe();subscription=null;}
  if(!subscription)subscription=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes(key)});
  if(actor!==token()){await subscription.unsubscribe();return;}
  await pushAPI("",{method:"POST",body:JSON.stringify(subscription)},actor);
  if(actor!==token())return;
  notify.textContent="Phone notifications on";notice.textContent="New messages can appear on your phone even when this app is closed.";
 }
 async function setup() {
  const actor=token();if(!actor||actor===owner||syncing)return;if(!("PushManager" in window)||!("Notification" in window)){notice.textContent="For phone notifications on iPhone, install this app from the Share menu first.";return;}
  syncing=true;owner=actor;
  try {const cfg=await pushAPI("/key",{},actor);if(actor!==token())return;if(!cfg.enabled){notice.textContent="Phone notifications are not available yet.";return;}key=cfg.public_key;notify.classList.remove("hidden");if(Notification.permission==="granted")await subscribe(actor);}
  catch(error){owner="";notice.textContent=error.message;}
  finally{syncing=false;if(actor!==token() && token())void setup();}
 }
 notify.addEventListener("click",async()=>{const actor=token();if(!actor||!key)return;notify.disabled=true;try{const permission=await Notification.requestPermission();if(permission!=="granted"){notice.textContent="Allow notifications in your phone/browser settings to receive new messages.";return;}await subscribe(actor);}catch(error){notice.textContent=error.message;}finally{notify.disabled=false;}});
 window.ProviderPWA={disconnect(actor){owner="";key="";notify.classList.add("hidden");notice.textContent="";void registration.then(async worker=>{const subscription=await worker?.pushManager?.getSubscription();if(subscription){await pushAPI("",{method:"DELETE",body:JSON.stringify({endpoint:subscription.endpoint})},actor).catch(()=>{});await subscription.unsubscribe();}}).catch(()=>{});}};
 new MutationObserver(()=>void setup()).observe(document.body,{attributes:true,attributeFilter:["class"]});void setup();
 window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();prompt=event;install.classList.remove("hidden");});
 install.addEventListener("click",async()=>{if(!prompt)return;await prompt.prompt();await prompt.userChoice;prompt=null;install.classList.add("hidden");});
 window.addEventListener("appinstalled",()=>{install.classList.add("hidden");prompt=null;});
 const nav=document.createElement("nav");nav.className="provider-mobile-nav";nav.setAttribute("aria-label","Provider app navigation");
 const source=document.querySelector(".side-card nav");
 const more=document.createElement("dialog");more.className="provider-more-menu";more.setAttribute("aria-label","Business tools");
 const heading=document.createElement("h2");heading.textContent="Your business";more.append(heading);
 const close=document.createElement("button");close.type="button";close.textContent="Close";close.onclick=()=>more.close();more.append(close);
 for(const [view,label] of [["overview","Home"],["merchant-orders","Orders"],["messages","Messages"],["support","Support"],["more","More"]]) {
  const button=document.createElement("button");button.type="button";button.dataset.mobileView=view;button.textContent=label;
  button.onclick=()=>{if(view==="more"){more.showModal();history.pushState({...history.state,providerMore:true},"",location.href);}else source.querySelector(`[data-view="${button.dataset.mobileView}"]`)?.click();};nav.append(button);
 }
 function sync(){
  for(const button of nav.querySelectorAll("button")) {
   if(button.textContent==="Orders"){button.dataset.mobileView=source.querySelector('[data-view="merchant-orders"]').classList.contains("hidden")?"requests":"merchant-orders";button.textContent=button.dataset.mobileView==="requests"?"Bookings":"Orders";}
   if(button.textContent==="Bookings"&&!source.querySelector('[data-view="merchant-orders"]').classList.contains("hidden")){button.dataset.mobileView="merchant-orders";button.textContent="Orders";}
   const active=source.querySelector(`[data-view="${button.dataset.mobileView}"]`)?.classList.contains("active");button.classList.toggle("active",!!active);button.setAttribute("aria-current",active?"page":"false");
  }
  more.querySelectorAll("[data-tool]").forEach(button=>button.remove());
  for(const original of source.querySelectorAll("[data-view]")){if(original.classList.contains("hidden"))continue;const button=document.createElement("button");button.type="button";button.dataset.tool=original.dataset.view;button.textContent=original.textContent;button.onclick=()=>{original.click();more.close();};more.append(button);}
 }
 document.body.append(nav,more);new MutationObserver(sync).observe(source,{subtree:true,attributes:true,attributeFilter:["class"]});sync();
 more.addEventListener("close",()=>{if(history.state?.providerMore)history.back();});window.addEventListener("popstate",()=>{if(more.open)more.close();});
 const offline=document.createElement("p");offline.className="provider-offline-bar";offline.setAttribute("role","status");offline.textContent="You are offline. Reconnect to send messages or save changes.";document.body.prepend(offline);
 function connection(){offline.hidden=navigator.onLine;}
 window.addEventListener("online",connection);window.addEventListener("offline",connection);connection();
 const viewport=window.visualViewport;
 function keyboard(){document.body.classList.toggle("provider-keyboard-open",!!viewport&&window.innerHeight-viewport.height>150);}
 viewport?.addEventListener("resize",keyboard);document.addEventListener("focusout",()=>setTimeout(keyboard,100));
 if(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.matchMedia("(display-mode: standalone)").matches){const tip=document.createElement("p");tip.className="provider-install-tip";tip.textContent="Add to your Home Screen from the browser Share menu to use the provider app.";document.querySelector("#authPanel").append(tip);}
})();
