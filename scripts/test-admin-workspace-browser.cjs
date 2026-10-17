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
   await send('Page.navigate',{url:'http://127.0.0.1:5176/index.html'});await new Promise(r=>setTimeout(r,250));
   await run(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(window.AtlAdminWorkspace&&document.querySelector('.atl-settings-button'))return resolve();if(++n>150)return reject(Error('Not ready'));setTimeout(poll,40)};poll()})`);
   await run(`(()=>{document.documentElement.dataset.theme=${JSON.stringify(theme)};$('authPanel').classList.add('hidden');$('dashboard').classList.remove('hidden');state.role='super_admin';state.token='synthetic-workspace';state.fullName='Super Admin';window.__calls=[];window.__failBusiness=false;window.__failSubscribers=false;window.__hold=false;window.__pending=[];window.confirm=()=>true;configureRoleUi();
    const provider={id:'11111111-1111-4111-8111-111111111111',business_name:'Synthetic business',contact_email:'provider@example.test',verification_status:'approved',created_at:'2026-10-17T12:00:00Z',subscription_status:'active'};
    const sub={provider_id:provider.id,business_name:'Synthetic business',contact_email:'provider@example.test',verification_status:'approved',plan_name:'Bronze',ends_at:'2026-11-17T12:00:00Z',billing_mode:'prepaid',duration_months:1};
    request=async(url,options={})=>{__calls.push({url,options});if(url.includes('/business-overview')){if(__failBusiness)throw Error('Overview unavailable');return {generated_at:new Date().toISOString(),active_accounts:120,active_providers:30,verified_providers:25,paid_providers:12,expiring_providers:2,pending_providers:5,pending_services:3,pending_products:4,open_support:2,open_reports:1,unresolved_complaints:2}};
     if(url==='/api/v1/ready')return {ok:true};if(url.includes('/ops/queue-health'))return {email:{pending:1,oldest_seconds:5},push:{pending:0,oldest_seconds:0},web_push:{pending:2,oldest_seconds:8},database_pool:{max:8,acquired:1}};
     if(url.includes('/subscribers')){if(__failSubscribers)throw Error('Subscribers unavailable');if(__hold)return new Promise(resolve=>__pending.push(resolve));return {items:[{...sub,provider_id:url.includes('cursor=')?'second-provider':sub.provider_id,business_name:url.includes('cursor=')?'Second business':'Synthetic business'}],has_more:!url.includes('cursor='),next_cursor:url.includes('cursor=')?'':'synthetic-cursor'};}
     if(url.includes('/provider-subscription-plans'))return {items:[{id:'plan-1',name:'Bronze',code:'basic',amount_ngn:500,listing_limit:3,is_active:true}]};
     if(url.includes('/provider-gateway-subscriptions'))return {items:[]};if(url.includes('/provider-subscription-access'))return {};
     if(url.includes('/provider-listings'))return {items:[]};if(url.includes('/merchant-products'))return {items:[]};if(url.includes('/providers'))return {items:[provider]};return {};
    };
    window.__show=async tab=>{setActiveTab(tab);await loadTabData(tab)};
   })()`);
   assert.equal(await run(`document.querySelectorAll('.side-nav [data-tab=orders],.side-nav [data-tab=transactions],.side-nav [data-tab=merchant-fulfillments]').length`),0);
   assert.equal(await run(`document.querySelectorAll('.atl-settings #legacyAdminNavigation [data-tab]').length`),3);
   assert.equal(await run(`new Set([...document.querySelectorAll('[id]')].map(e=>e.id)).size===document.querySelectorAll('[id]').length`),true,'unique DOM IDs after panel moves');
   for(const tab of ['overview','providers','service-moderation','product-moderation','subscriptions']){
    await run(`__show('${tab}')`);
    const geo=await run(`({scroll:document.documentElement.scrollWidth,panels:[...document.querySelectorAll('.tab-panel:not(.hidden)')].map(p=>p.dataset.panel)})`);
    assert.ok(geo.scroll<=width+1,`${width}/${theme}/${tab} ${JSON.stringify(geo)}`);assert.deepEqual(geo.panels,[tab]);
    if(tab==='overview'){assert.equal(await run(`document.querySelectorAll('.workspace-metric').length`),4);assert.equal(await run(`document.querySelectorAll('.attention-item').length`),7);assert.ok(await run(`$('businessSystem').textContent.includes('8 maximum')`));assert.equal(await run(`__calls.filter(c=>c.url.includes('/business-overview')).length`),1);}
    if(tab==='providers'){assert.equal(await run(`document.querySelectorAll('[data-panel=providers] > .panel').length`),1);assert.equal(await run(`__calls.some(c=>c.url.includes('provider-subscription-plans'))`),false,'verification does not load billing');}
    if(tab==='subscriptions'){assert.equal(await run(`$('subscribersTable').textContent.includes('Synthetic business')`),true);assert.equal(await run(`$('providerBillingSection').open`),false);assert.equal(await run(`__calls.some(c=>c.url.includes('provider-subscription-plans'))`),false,'billing lazy until opened');}
    if(width===1440&&process.env.ADMIN_WORKSPACE_SCREENSHOTS){fs.mkdirSync(process.env.ADMIN_WORKSPACE_SCREENSHOTS,{recursive:true});const size=(await send('Page.getLayoutMetrics')).cssContentSize;const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:Math.min(3000,size.height),scale:1}});fs.writeFileSync(path.join(process.env.ADMIN_WORKSPACE_SCREENSHOTS,`${tab}-${theme}.png`),Buffer.from(shot.data,'base64'));}
   }
   await run(`$('moreSubscribersButton').click();new Promise(r=>setTimeout(r,30))`);assert.equal(await run(`document.querySelectorAll('#subscribersTable tbody tr').length`),2);assert.ok(await run(`__calls.some(c=>c.url.includes('cursor=synthetic-cursor'))`));
   await run(`$('providerBillingSection').open=true;new Promise(r=>setTimeout(r,50))`);assert.ok(await run(`__calls.some(c=>c.url.includes('provider-subscription-plans'))`));
   await run(`(async()=>{state.role='catalog_admin';await __show('subscriptions');})()`);assert.equal(await run(`$('providerBillingSection').classList.contains('hidden')`),true);assert.equal(await run(`$('providerBillingSection').open`),false);
   await run(`(async()=>{state.role='super_admin';await __show('overview');document.querySelector('[data-open-workspace="subscriptions"]').click();await new Promise(r=>setTimeout(r,30));})()`);assert.equal(await run(`state.activeTab`),'subscriptions');assert.equal(await run(`$('subscriberStatus').value`),'expiring');
   await run(`(async()=>{__failSubscribers=true;await __show('subscriptions')})()`);assert.ok(await run(`$('subscriberStatusText').textContent.includes('retry')`));assert.equal(await run(`$('reloadSubscribersButton').disabled`),false);
   await run(`(async()=>{__failBusiness=true;setActiveTab('overview');await AtlAdminWorkspace.overview({force:true})})()`);assert.ok(await run(`$('businessOverviewStatus').textContent.includes('retry')`));assert.equal(await run(`$('reloadBusinessOverview').disabled`),false);
   await run(`document.querySelector('.atl-settings-button').click();document.querySelector('.atl-settings [data-tab=orders]').click();new Promise(r=>setTimeout(r,30))`);assert.equal(await run(`state.activeTab`),'orders');assert.equal(await run(`document.querySelector('.atl-settings').open`),false);
   // A pending subscriber request from a previous account cannot overwrite the new account.
   await run(`__failSubscribers=false;__hold=true;void AtlAdminWorkspace.subscribers();state.token='second-account';__hold=false;void AtlAdminWorkspace.subscribers();new Promise(r=>setTimeout(r,30))`);
   await run(`__pending[0]({items:[{business_name:'OLD ACCOUNT LEAK'}],has_more:false});new Promise(r=>setTimeout(r,30))`);assert.equal(await run(`$('subscribersTable').textContent.includes('OLD ACCOUNT LEAK')`),false);
  }
  console.log('Admin workspace PASS: isolated tabs, Overview counts/health, paid subscribers/pagination, lazy billing, role/session isolation and responsive themes');
 }finally{socket.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
