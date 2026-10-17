/* Native Chrome CDP, local synthetic data only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9224/json')).json();
 const socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 try{
  await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  for(const width of [390,853,1440])for(const theme of ['light','dark']){
   await send('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:width<768});
   await send('Page.navigate',{url:'http://127.0.0.1:5176/index.html'});
   await new Promise(r=>setTimeout(r,250));
   await run(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(window.AtlAdminAnalytics&&document.querySelector('.atl-settings-button'))return resolve();if(++n>150)return reject(Error('Not ready'));setTimeout(poll,40)};poll()})`);
   await run(`(()=>{document.documentElement.dataset.theme=${JSON.stringify(theme)};$('authPanel').classList.add('hidden');$('dashboard').classList.remove('hidden');state.role='super_admin';state.token='local-synthetic';document.querySelectorAll('.side-nav [data-tab]').forEach(b=>b.classList.toggle('hidden',!allowedTabsForRole().includes(b.dataset.tab)));$('sessionName').textContent='Super Admin';$('sessionRole').textContent='Super Admin ? super_admin';window.__calls=[];window.__fail=false;window.__reports=[{id:'report-1',reporter:'Synthetic reporter',state:'open',reason:'Review this conversation',created_at:'2026-10-17T12:00:00Z'},{id:'report-2',reporter:'Other reporter',state:'resolved',reason:'Spam',created_at:'2026-10-17T12:00:00Z'}];request=async(url,options={})=>{__calls.push({url,options});if(__fail)throw Error('Synthetic unavailable');if(url.endsWith('/overview'))return {from:'2026-09-18',through:'2026-10-17',receipts:3,gross_receipts:1500,complaints:2,unresolved_complaints:1,recorded_refunds:200,flagged_receipts:1,daily:Array.from({length:30},(_,i)=>({date:new Date(Date.UTC(2026,8,18+i)).toISOString().slice(0,10),receipts:i===29?3:0,gross_receipts:i===29?1500:0}))};if(url.endsWith('/messages'))return {items:[{name:'Synthetic user',body:'<img src=x onerror=alert(1)>',media_urls:[]}]};if(url.endsWith('/resolve')){__reports[0].state='resolved';return {}};return {items:__reports};};window.__show=async tab=>{state.activeTab=tab;document.querySelectorAll('.side-nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!==tab));await loadTabData(tab);};})()`);
   for(const tab of ['analytics','community']){
    await run(`__show('${tab}')`);
    const geo=await run(`({inner:innerWidth,scroll:document.documentElement.scrollWidth,els:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().right])})`);assert.ok(geo.scroll<=width+1,`${tab}/${width}/${theme} overflow ${JSON.stringify(geo)}`);
    assert.equal(await run(`document.body.classList.contains('operations-view')`),true);
    if(tab==='analytics'){
     assert.equal(await run(`document.querySelectorAll('.analytics-bar').length`),30);
     assert.ok(await run(`$('analyticsStats').textContent.includes('1,500.00')`));
     assert.ok(await run(`document.querySelector('.analytics-bar[style="height:100%"]')?.getBoundingClientRect().height>150`),'bars have real height');
     assert.equal(await run(`__calls.some(c=>c.url.includes('profit-loss'))`),false);
     await run(`(async()=>{window.__firstBar=document.querySelector('.analytics-bar');window.__analyticsLoads=__calls.filter(c=>c.url.includes('/analytics/overview')).length;await refreshVisibleAdminPage();await refreshVisibleAdminPage();const oldRequest=request;request=async(url,options)=>url.includes('/activity')?{events:[{id:'new-event',is_read:false}],cursor:'next'}:oldRequest(url,options);state.activityCursor='previous';await pollAdminActivity();request=oldRequest;})()`);
     assert.equal(await run(`__calls.filter(c=>c.url.includes('/analytics/overview')).length`),await run(`__analyticsLoads`),'automatic polling must not reload Analytics');
     await run(`$('reloadAnalyticsButton').click();new Promise(r=>setTimeout(r,30))`);
     assert.equal(await run(`__calls.filter(c=>c.url.includes('/analytics/overview')).length`),await run(`__analyticsLoads+1`),'manual refresh remains available');
     assert.equal(await run(`document.querySelector('.analytics-bar')===__firstBar`),true,'unchanged analytics keeps chart nodes and scroll stable');

    }
    if(width===1440&&process.env.ADMIN_ANALYTICS_SCREENSHOTS){fs.mkdirSync(process.env.ADMIN_ANALYTICS_SCREENSHOTS,{recursive:true});const size=(await send('Page.getLayoutMetrics')).cssContentSize;const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:Math.min(3000,size.height),scale:1}});fs.writeFileSync(path.join(process.env.ADMIN_ANALYTICS_SCREENSHOTS,`${tab}-${theme}.png`),Buffer.from(shot.data,'base64'));}
   }
   await run(`$('communityAdminFilter').value='open';$('communityAdminFilter').dispatchEvent(new Event('change'))`);
   assert.equal(await run(`document.querySelectorAll('.report-card').length`),1);
   await run(`$('communityAdminSearch').value='no-match';$('communityAdminSearch').dispatchEvent(new Event('input'))`);
   assert.ok(await run(`$('communityAdminRows').textContent.includes('No reports match')`));
   await run(`$('communityAdminSearch').value='';$('communityAdminSearch').dispatchEvent(new Event('input'));document.querySelector('.report-card button').click();new Promise(r=>setTimeout(r,30))`);
   assert.ok(await run(`document.querySelector('.report-history').textContent.includes('<img')`));assert.equal(await run(`document.querySelectorAll('.report-history img').length`),0);
   await run(`document.querySelectorAll('.report-card button')[0].click();new Promise(r=>setTimeout(r,30))`);
   assert.equal(await run(`__calls.filter(c=>c.url.endsWith('/resolve')&&c.options.method==='POST').length`),1);
   await run(`(async()=>{__reports=[];await __show('community')})()`);
   assert.ok(await run(`$('communityAdminRows').textContent.includes('No reported conversations yet')`));
   await run(`(async()=>{__fail=true;await __show('analytics')})()`);
   assert.ok(await run(`$('analyticsSummary').textContent.includes('Refresh')`));assert.equal(await run(`$('reloadAnalyticsButton').disabled`),false);
   await run(`(async()=>{__fail=false;state.role='catalog_admin';await __show('analytics')})()`);
   assert.equal(await run(`$('analyticsStats').textContent.includes('1,500')`),false);assert.equal(await run(`$('analyticsDaily').textContent.includes('1,500')`),false);
  }
  console.log('Analytics and reported-chat calculations, roles, errors, actions and responsive themes PASS');
 }finally{socket.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
