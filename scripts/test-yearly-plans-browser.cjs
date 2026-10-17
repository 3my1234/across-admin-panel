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
  for(const width of [390,853,1440])for(const theme of ['light','dark']){
   await send('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:width<768});
   await send('Page.navigate',{url:'http://127.0.0.1:5176/provider.html'});await new Promise(r=>setTimeout(r,250));
   await run(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(document.querySelector('.provider-mobile-nav'))return resolve();if(++n>150)return reject(Error('Portal not ready'));setTimeout(poll,40)};poll()})`);
   await run(`(()=>{document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.classList.remove('auth-mode');document.getElementById('authPanel').classList.add('hidden');document.getElementById('portal').classList.remove('hidden');document.querySelectorAll('[data-view-panel]').forEach(p=>p.classList.add('hidden'));document.querySelector('[data-view-panel=subscription]').classList.remove('hidden');window.ProviderNativeBridge={embedded:()=>false};window.__checkout=[];window.__messages=[];
    const prices=[500,1000,2000,5000],limits=[5,15,40,80];const state={provider:{verification_status:'approved',subscription:{}},transferMonths:[1,3,6,12],plans:prices.map((price,i)=>({id:'plan-'+i,name:['Basic','Growth','Business','Diamond'][i],amount_ngn:price,listing_limit:limits[i],card_available:i===0,period_prices:[1,3,6,12].map(months=>({duration_months:months,amount_ngn:price*months*(months===12?.9:1),savings_ngn:months===12?price*12*.1:0,discount_percent:months===12?10:0,card_available:months===12||(months===1&&i===0),banktransfer_available:true}))}))};
    const factory=new Function('state','$','hasActiveSubscription','hasPendingSubscription','clearPendingSubscription','renderSubscriptionGates','escapeHtml','money','setMessage','api','savePendingSubscription',${JSON.stringify(planSource)}+';return {renderPlans,subscribe};');
    window.__plans=factory(state,id=>document.getElementById(id),()=>false,()=>false,()=>{},()=>{},v=>String(v),v=>'NGN '+Number(v).toLocaleString('en-NG'),v=>__messages.push(v),async(url,options)=>{__checkout.push(JSON.parse(options.body));throw Error('Synthetic checkout stopped before navigation');},()=>{});__plans.renderPlans();
   })()`);
   assert.equal(await run(`document.querySelectorAll('[data-plan-card]').length`),4);
   assert.ok(await run(`document.querySelector('[data-plan-card="plan-3"]').textContent.includes('80 product listings + 80 service/property listings')`));
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
   await run(`window.ProviderNativeBridge={embedded:()=>true};__plans.renderPlans()`);assert.equal(await run(`document.querySelectorAll('[data-subscribe]').length`),0,'native purchase guard retained');
  }
  console.log('Yearly plans browser PASS: all four tiers, quoted savings, card/transfer periods, native guard and responsive themes');
 }finally{socket.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
