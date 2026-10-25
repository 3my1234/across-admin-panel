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
  const providerSource=fs.readFileSync(path.join(__dirname,'../provider.js'),'utf8');
  const start=providerSource.indexOf('  let subscriptionFlight=false;');
  const planSource=providerSource.slice(start,providerSource.indexOf('  function renderSubscriptionGates(',start));
  const renewalSource=providerSource.slice(providerSource.indexOf('  async function loadRenewalStatus()'),providerSource.indexOf('  async function loadPlans()'));
  for(const width of [390,853,1440])for(const theme of ['light','dark']){
   await send('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:width<768});
   await send('Page.navigate',{url:'http://127.0.0.1:5176/provider.html'});await new Promise(r=>setTimeout(r,250));
   await run(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(document.readyState==='complete'&&document.querySelector('.provider-mobile-nav'))return resolve();if(++n>150)return reject(Error('Portal not ready'));setTimeout(poll,40)};poll()})`);
   await run(`(()=>{localStorage.setItem('atl.appearance.v1',${JSON.stringify(theme)});window.dispatchEvent(new StorageEvent('storage',{key:'atl.appearance.v1',newValue:${JSON.stringify(theme)}}));document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.classList.remove('auth-mode');document.getElementById('authPanel').classList.add('hidden');document.getElementById('portal').classList.remove('hidden');document.querySelectorAll('[data-view-panel]').forEach(p=>p.classList.add('hidden'));document.querySelector('[data-view-panel=subscription]').classList.remove('hidden');window.ProviderNativeBridge={embedded:()=>false};window.__checkout=[];window.__messages=[];
    const prices=[500,1000,2000,5000],limits=[3,10,25,60];const state={provider:{verification_status:'approved',subscription:{}},transferMonths:[1,3,6,12],plans:prices.map((price,i)=>({id:'plan-'+i,name:['Bronze','Silver','Diamond','Gold'][i],amount_ngn:price,listing_limit:limits[i],post_policy:{max_images:[3,5,8,12][i],max_videos:0,max_video_seconds:60,town_hall:true,town_hall_room_limit:[3,5,8,10][i],town_hall_search:true,direct_messaging:true,recommended:true,visibility:['basic','standard','enhanced','premium'][i],promotional_weight:[1,2,3,5][i]},card_available:i===0,period_prices:[1,3,6,12].map(months=>({duration_months:months,amount_ngn:price*months*(months===12?.9:1),savings_ngn:months===12?price*12*.1:0,discount_percent:months===12?10:0,card_available:months===12||(months===1&&i===0),banktransfer_available:true}))}))};
    const factory=new Function('state','$','hasActiveSubscription','hasPendingSubscription','clearPendingSubscription','renderSubscriptionGates','escapeHtml','money','setMessage','api','savePendingSubscription',${JSON.stringify(renewalSource+planSource)}+';return {renderPlans,subscribe,manageRenewal};');
    window.__active=false;window.__state=state;window.__renewals=[];window.confirm=()=>true;
    window.__plans=factory(state,id=>document.getElementById(id),()=>__active,()=>false,()=>{},()=>{},v=>String(v),v=>'NGN '+Number(v).toLocaleString('en-NG'),v=>__messages.push(v),async(url,options)=>{if(url.endsWith('subscription-renewal')){if(options?.method==='POST'){__renewals.push(JSON.parse(options.body));if(window.__renewalFail)throw Error('Gateway cancellation unconfirmed');return {};}return window.__renewalResponse;}__checkout.push(JSON.parse(options.body));throw Error('Synthetic checkout stopped before navigation');},()=>{});__plans.renderPlans();
   })()`);
   assert.equal(await run(`document.documentElement.dataset.theme`),theme);
   assert.equal(await run(`document.querySelectorAll('[data-plan-card]').length`),4);
   assert.ok(await run(`document.querySelector('[data-plan-card="plan-3"]').textContent.includes('60 listings across products and services')`));
   assert.ok(await run(`document.querySelector('[data-plan-card="plan-3"]').textContent.includes('Join up to 10 Town Hall requests at once')`));
   assert.ok(await run(`document.querySelector('[data-plan-card="plan-0"]').textContent.includes('3 images per listing')`));
   for(let i=0;i<4;i++){
    await run(`(()=>{const select=document.querySelector('[data-transfer-months="plan-${i}"]');select.value='12';select.dispatchEvent(new Event('change'));})()`);
    assert.equal(await run(`document.querySelector('[data-plan-card="plan-${i}"] [data-plan-price]').textContent`),'NGN '+[5400,10800,21600,54000][i].toLocaleString('en-NG')+'/year');
    assert.equal(await run(`document.querySelector('[data-plan-card="plan-${i}"] [data-method=card]').disabled`),false,'annual card works without a monthly recurring plan');
    assert.ok(await run(`document.querySelector('[data-plan-card="plan-${i}"] [data-plan-summary]').textContent.includes('no automatic renewal')`));
   }
   assert.ok(await run(`document.documentElement.scrollWidth<=${width}+1`),`plans overflow ${width}/${theme}`);
   if(width===1440&&process.env.YEARLY_PLAN_SCREENSHOTS){fs.mkdirSync(process.env.YEARLY_PLAN_SCREENSHOTS,{recursive:true});const size=(await send('Page.getLayoutMetrics')).cssContentSize;const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:Math.min(3000,size.height),scale:1}});fs.writeFileSync(path.join(process.env.YEARLY_PLAN_SCREENSHOTS,`yearly-${theme}.png`),Buffer.from(shot.data,'base64'));}
   await run(`document.querySelector('[data-plan-card="plan-3"] [data-method=card]').click();new Promise(r=>setTimeout(r,30))`);
   assert.equal(await run(`__checkout[0].duration_months`),12);assert.equal(await run(`__checkout[0].payment_method`),'card');
   await run(`const s=document.querySelector('[data-transfer-months="plan-0"]');s.value='12';s.dispatchEvent(new Event('change'));document.querySelector('[data-plan-card="plan-0"] [data-method=banktransfer]').click();new Promise(r=>setTimeout(r,30))`);
   assert.equal(await run(`__checkout[1].duration_months`),12);assert.equal(await run(`__checkout[1].payment_method`),'banktransfer');
   await run(`(()=>{__active=true;__state.provider.subscription={status:'active',billing_mode:'recurring',current_period_end:new Date(Date.now()+29*86400000).toISOString()};__state.renewal={can_manage:true,current_plan_id:'plan-0',renewal_status:''};__plans.renderPlans();})()`);
   assert.equal(await run(`Boolean(document.querySelector('[data-stop-renewal]'))`),true,'provider cancellation control');
   assert.equal(await run(`document.querySelector('[data-next-renewal-plan] option[value="plan-0"]')`),null,'next plan excludes current tier');
   await run(`(async()=>{window.__originalEnd=__state.provider.subscription.current_period_end;window.__renewalResponse={can_manage:true,current_plan_id:'plan-0',renewal_status:'stopped',next_plan_id:'plan-1',next_plan_name:'Growth',change_at:__originalEnd};await __plans.manageRenewal('plan-1');})()`);
   assert.equal(await run(`__renewals[0].next_plan_id`),'plan-1');
   assert.equal(await run(`__state.provider.subscription.current_period_end`),await run(`__originalEnd`),'scheduled tier preserves paid expiry');
   assert.equal(await run(`document.querySelectorAll('[data-subscribe]:not(:disabled)').length`),0,'active paid period cannot purchase replacement');
   assert.ok(await run(`document.querySelector('.renewal-controls').textContent.includes('will not be charged automatically')`));
   assert.ok(await run(`document.documentElement.scrollWidth<=${width}+1`),'renewal controls fit viewport');
   if(width===1440&&process.env.YEARLY_PLAN_SCREENSHOTS){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(process.env.YEARLY_PLAN_SCREENSHOTS,`renewal-${theme}.png`),Buffer.from(shot.data,'base64'));}
   await run(`(async()=>{window.__renewalFail=true;window.__renewalResponse={can_manage:true,renewal_status:'uncertain'};await __plans.manageRenewal('');})()`);
   assert.ok(await run(`document.querySelector('[data-stop-renewal]').textContent.includes('Retry')`),'failed cancellation stays actionable');
   assert.ok(await run(`document.querySelector('.renewal-controls').textContent.includes('may still be active')`));
   await run(`(async()=>{window.__renewalFail=false;window.__renewalResponse={can_manage:true,renewal_status:'stopped'};await __plans.manageRenewal('');})()`);
   assert.equal(await run(`__renewals.at(-1).next_plan_id`),'','cancel clears next plan');
   await run(`__active=false;__state.renewal={can_manage:true,renewal_status:'stopped',next_plan_id:'plan-1',next_plan_name:'Growth',change_at:new Date(Date.now()-1000).toISOString()};__plans.renderPlans()`);
   assert.ok(await run(`document.querySelector('.renewal-controls').textContent.includes('ready for checkout')`),'expiry requires a new verified purchase');
   assert.equal(await run(`document.querySelector('[data-plan-card="plan-1"] [data-method=banktransfer]').disabled`),false);
   await run(`__active=true;__state.renewal={can_manage:true,renewal_status:''};window.ProviderNativeBridge={embedded:()=>true};__plans.renderPlans()`);
   assert.equal(await run(`Boolean(document.querySelector('[data-stop-renewal]'))`),true,'native workspace can stop renewal');
   assert.equal(await run(`Boolean(document.querySelector('[data-schedule-renewal]'))`),false,'native workspace does not offer purchase direction');
   await run(`window.ProviderNativeBridge={embedded:()=>true};__plans.renderPlans()`);assert.equal(await run(`document.querySelectorAll('[data-subscribe]').length`),0,'native purchase guard retained');
  }
  console.log('Yearly plans and renewal controls PASS: quoted prices, cancellation, uncertainty, scheduled tier, paid expiry, native guard and responsive themes');
 }finally{socket.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
