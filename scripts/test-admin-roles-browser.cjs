/* Real browser acceptance, synthetic identities/data; never calls the live API. */
const assert=require('node:assert/strict');
(async()=>{
 const page=await(await fetch('http://127.0.0.1:9227/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const queue=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=queue.get(m.id);queue.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;queue.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}))});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 try{
 await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 for(const role of ['super_admin','catalog_admin','support_admin','moderation_admin','finance_admin','ads_admin']){
 const init=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
 localStorage.clear();sessionStorage.clear();localStorage.setItem('across.admin.token','synthetic');localStorage.setItem('across.admin.role','super_admin');localStorage.setItem('across.admin.activeTab','admins');
 window.__requests=[];window.__holdPatch=false;window.__pendingPatch=null;
 const nativeFetch=window.fetch;window.fetch=(url,options={})=>{url=String(url);if(!url.startsWith('https://api.atlxpres.com'))return nativeFetch(url,options);
 __requests.push({url,method:options.method||'GET',body:options.body});let data={items:[],events:[],has_more:false};
 if(url.includes('/admin/session'))data={role:${JSON.stringify(role)},admin_id:'owner',full_name:'Synthetic'};
 else if(url.includes('/admin/admins')&&(!options.method||options.method==='GET'))data={admins:[{id:'owner',email:'owner@example.test',full_name:'Owner',role:'super_admin',is_active:true},{id:'staff',email:'staff@example.test',full_name:'Staff',role:'support_admin',is_active:true}],has_more:false};
 else if(url.includes('/xp/withdrawals'))data={items:[{id:'withdrawal',status:'processing',points:1000,email:'fixture@example.test',created_at:new Date().toISOString()}]};
 else if(url.includes('/discovery/summary'))data={days:30,items:[{placement:'promoted',impressions:12,clicks:3,contact_taps:1}]};
 else if(url.includes('/api/v1/ready'))data={ok:true};
 const result=()=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 if(__holdPatch&&options.method==='PATCH'&&url.includes('/admins/'))return new Promise(resolve=>__pendingPatch=()=>resolve(result()));
 return Promise.resolve(result());};`});
 await send('Page.navigate',{url:'http://127.0.0.1:5178/index.html'});
 await run(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(window.AtlAdminRoles&&typeof state!=='undefined'&&state.role===${JSON.stringify(role)}&&!document.getElementById('dashboard').classList.contains('hidden'))return resolve();if(++n>150)return reject(Error('Session did not restore'));setTimeout(poll,40)};poll()})`);
 await run(`loadDashboard({force:true})`);
 assert.equal(await run(`state.role`),role);
 const visible=await run(`[...document.querySelectorAll('.side-nav [data-tab]')].filter(n=>!n.classList.contains('hidden')).map(n=>n.dataset.tab)`);
 assert.equal(visible.includes('admins'),role==='super_admin',role+' admin navigation');
 const calls=await run(`__requests.map(r=>r.url)`);
 if(['support_admin','moderation_admin','finance_admin','ads_admin'].includes(role))assert.equal(calls.some(u=>u.includes('/business-overview')||u.includes('/admin/admins')||u.includes('/ops/queue-health')),false,role+' startup privacy');
 assert.ok(await run(`allowedTabsForRole().includes(state.activeTab)`),role+' permitted landing');
 if(role!=='super_admin'){
  const before=await run(`__requests.filter(r=>r.url.includes("/admin/admins")).length`);await run(`loadTabData('admins')`);assert.equal(await run(`__requests.filter(r=>r.url.includes("/admin/admins")).length`),before,role+' forced unauthorized navigation');
 }
 for(const width of [390,1440]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
 assert.ok(await run(`document.documentElement.scrollWidth<=${width}+1`),role+' responsive width '+width);
}
if(role==='super_admin'){
  await run(`setActiveTab('admins');loadTabData('admins')`);
  assert.ok(await run(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Manage access')`));
  await run(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Manage access').click()`);
  assert.equal(await run(`$('adminAccessDialog').open`),true);
  await run(`__holdPatch=true;$('adminAccessRole').value='finance_admin';$('adminAccessForm').dispatchEvent(new Event('submit',{cancelable:true}));$('adminAccessForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
  assert.equal(await run(`__requests.filter(r=>r.method==='PATCH'&&r.url.includes('/admins/')).length`),1,'access save single flight');
  assert.deepEqual(JSON.parse(await run(`__requests.find(r=>r.method==='PATCH'&&r.url.includes('/admins/')).body`)),{role:'finance_admin',is_active:true});
  await run(`__pendingPatch();new Promise(r=>setTimeout(r,100))`);
  assert.equal(await run(`$('adminAccessDialog').open`),false);
 }
 if(role==='finance_admin'){
  await run(`setActiveTab('xp-withdrawals');loadTabData('xp-withdrawals')`);
  assert.equal(await run(`!!document.querySelector('#xpWithdrawalList option[value="paid"]')`),false);
  assert.match(await run(`$('xpWithdrawalList').textContent`),/Super Admin/);
 }
 if(['moderation_admin','finance_admin','ads_admin'].includes(role)){
 const before=await run(`__requests.length`);await run(`document.querySelector('.atl-settings-button').click();new Promise(r=>setTimeout(r,25))`);
 assert.equal(await run(`__requests.length`),before,role+' settings do not request chat permissions');
 assert.equal(await run(`document.querySelector('.receipt-preferences').classList.contains('hidden')`),true);await run(`document.querySelector('.atl-settings').close()`);
}
if(role==='ads_admin')assert.match(await run(`$('promotionSummaryRows').textContent`),/12 impressions/);
 await run(`stopAdminActivityPolling()`);await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
 console.log('PASS browser role',role);
 }
 }finally{ws.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
