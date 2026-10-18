const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9224/json')).json(),socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const jobs=new Map();socket.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.id){const task=jobs.get(d.id);jobs.delete(d.id);d.error?task.reject(d.error):task.resolve(d.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;jobs.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const run=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 try{
  await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:(process.env.COMMUNITY_TEST_ORIGIN||'http://127.0.0.1:5176')+'/provider.html'});
  await run(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(document.readyState==='complete'&&window.CommunityTownHall)return resolve();if(++n>100)return reject(Error('Hall not ready'));setTimeout(poll,40)};poll()})`);
  await run(`(async()=>{window.__hallActor='buyer';window.__hallCalls=[];window.__hallHead=[1,2,3,4,5,6,7,8];window.__hallExpired=false;window.__hallPosted=[];window.__hallPage=document.createElement('div');__hallPage.style.cssText='position:fixed;inset:0;z-index:1000;background:var(--dashboard-background,#f5f7f6);overflow:auto';window.__hallRoot=document.createElement('main');__hallRoot.style.cssText='padding:12px;max-width:700px;margin:auto';__hallPage.append(__hallRoot);document.body.append(__hallPage);window.__makeHall=n=>({id:'11111111-1111-4111-8111-'+String(n).padStart(12,'0'),title:'Rice for an event',description:n===1?'I need 50 bags of rice in Abuja. My budget is ₦48,500 per bag.':'Looking for a plumber in Gwarinpa. Who can help?',buyer_name:n===1?'Emmanuel Obaze':'Ada',created_at:'2026-10-15T00:31:00Z',message_only:true,state:'open',seats:0,offers:[],is_owner:true,admitted:true});window.__hallControl=await CommunityTownHall.mount({element:__hallRoot,getActor:()=>__hallActor,openChat:async()=>{},request:async(path,options={})=>{__hallCalls.push([path,options]);if(options.method==='POST'&&path==='/chat/town-hall'){__hallPosted.push(JSON.parse(options.body));return {id:__makeHall(20).id};}if(path.includes('?'))return {items:__hallHead.map(__makeHall),next_cursor:''};return {...__makeHall(1),state:__hallExpired?'closed':'open',expired:__hallExpired,offers:[{id:'offer',provider_name:'Timo Ventures',unit_price:11500,terms:'I can help with your request.'}]};}});})()`);
  assert.equal(await run(`__hallRoot.querySelectorAll('[data-hall-request]').length`),8);
  await run(`__hallPage.scrollTop=400`);
  const before=await run(`__hallRoot.querySelector('[data-hall-request]').getBoundingClientRect().top`);
  await run(`__hallHead=[9,1,2,3,4,5,6,7,8];__hallControl.refresh(true)`);
  assert.equal(await run(`__hallRoot.querySelector('[data-hall-request]').dataset.hallRequest.endsWith('000000000001')`),true,'reading feed is not reordered');
  assert.ok(await run(`!!__hallRoot.querySelector('[data-hall-latest]')`),'new requests queue');
  const after=await run(`__hallRoot.querySelector('[data-hall-request]').getBoundingClientRect().top`);assert.ok(Math.abs(after-before)<2,'queue preserves visible anchor');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await run(`__hallRoot.querySelector('[data-hall-latest]').click()`);
  assert.equal(await run(`__hallRoot.querySelector('[data-hall-request]').dataset.hallRequest.endsWith('000000000009')`),true,'explicit latest reveals new head');
  assert.equal(await run(`getComputedStyle(__hallRoot.querySelector('.hall-request-new')).animationName`),'none','reduced motion removes arrival animation');
  await run(`__hallRoot.querySelector('[data-hall-toggle]').click();__hallRoot.querySelector('textarea').value='Keep my draft';__hallRoot.querySelector('textarea').dispatchEvent(new Event('input'));__hallControl.refresh(true)`);
  assert.equal(await run(`__hallRoot.querySelector('textarea').value`),'Keep my draft','background refresh preserves focused draft');
  await run(`document.activeElement.blur();__hallRoot.querySelector('[data-hall-toggle]').click();__hallExpired=true;__hallRoot.querySelector('[data-hall-detail]').click();new Promise(r=>setTimeout(r,50))`);
  assert.equal(await run(`!!__hallRoot.querySelector('[data-hall-repost]')`),true,'owner can repost expired record');
  await run(`__hallRoot.querySelector('[data-hall-repost]').click()`);
  assert.equal(await run(`__hallRoot.querySelector('textarea').value`),'I need 50 bags of rice in Abuja. My budget is ₦48,500 per bag.');
  await run(`__hallRoot.querySelector('[data-hall-create]').requestSubmit();new Promise(r=>setTimeout(r,50))`);
  assert.equal(await run(`__hallPosted.length`),1);assert.ok(await run(`!!__hallPosted[0].client_request_id`));
  await run(`__hallExpired=false;__hallRoot.querySelector('[data-hall-back]').click();new Promise(r=>setTimeout(r,50))`);
  for(const width of [320,390,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});assert.equal(await run(`__hallRoot.scrollWidth<=__hallRoot.clientWidth+1`),true,'responsive Hall '+width);}
  if(process.env.HALL_SCREENSHOT){await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await run(`__hallPage.scrollTop=0;document.documentElement.dataset.theme='light'`);const capture=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.HALL_SCREENSHOT,Buffer.from(capture.data,'base64'));}
  await run(`__hallActor='different-account';window.__beforeCalls=__hallCalls.length;__hallControl.refresh(true)`);assert.equal(await run(`__hallCalls.length===__beforeCalls`),true,'retired actor makes no requests');
  await run(`(async()=>{window.__admit=false;window.__opened=[];window.__providerHall=await CommunityTownHall.mount({element:__hallRoot,roomId:__makeHall(1).id,getActor:()=>__hallActor,openChat:async id=>__opened.push(id),request:async()=>({...__makeHall(1),is_owner:false,admitted:__admit,application_state:__admit?'admitted':'pending',offers:[]})});})()`);
  assert.equal(await run(`__opened.length`),0,'pending provider waits for approval');
  await run(`__admit=true;__providerHall.refresh(true)`);assert.equal(await run(`__opened[0]`),await run(`__makeHall(1).id`),'approval enters chat directly');
  console.log('Town Hall live browser passed: buffered arrivals, scroll anchor, reduced motion, draft preservation, expired-owner repost, responsive layout and actor cleanup.');
 }finally{await run(`window.__hallControl?.destroy();window.__hallPage?.remove()`).catch(()=>{});socket.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
