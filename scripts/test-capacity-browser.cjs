const assert=require('node:assert/strict');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:'+(process.env.CAPACITY_CDP_PORT||'9224')+'/json')).json(),socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 try{
  await send('Page.enable');await send('Network.enable');
  const fixture=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
   localStorage.clear();localStorage.setItem('across.admin.role','super_admin');localStorage.setItem('across.admin.adminId','synthetic');localStorage.setItem('across.admin.token','synthetic');localStorage.setItem('across.admin.activeTab','overview');window.__capacityCalls=[];
   const real=window.fetch;window.fetch=(url,options)=>{if(!String(url).startsWith('https://api.atlxpres.com'))return real(url,options);const path=String(url);let data={items:[],events:[],ok:true};
   if(path.includes('/admin/session'))data={role:'super_admin',admin_id:'synthetic',full_name:'Fixture'};
   if(path.includes('/business-overview'))data={generated_at:new Date().toISOString(),active_accounts:10,active_providers:5,paid_providers:2,verified_providers:5};
   if(path.includes('/ops/capacity')){__capacityCalls.push(path);data={server_time:new Date().toISOString(),items:[{host:'main',observed_at:new Date().toISOString(),report:{host:{cpu_percent:40,memory_used_percent:50,disk_used_percent:20,disk_free_bytes:10737418240},database:{connections:10,max_connections:100,lock_waiters:0},checks:{api_ready:true},alerts:['database_locks'],containers:[{name:'<img src=x onerror=alert(1)>',state:'running',memory:'10MiB',restarts:0}]}},{host:'database',observed_at:new Date(Date.now()-300000).toISOString(),report:{host:{cpu_percent:20,memory_used_percent:20,disk_used_percent:10},checks:{api_ready:true},containers:[]}}]};}
   return Promise.resolve(new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}}));};`});
  await send('Page.navigate',{url:'http://127.0.0.1:'+(process.env.CAPACITY_HTTP_PORT||'5176')+'/index.html'});for(let attempt=0;attempt<50;attempt++){if(await run(`Boolean(document.body?.textContent?.includes('STALE'))`))break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(await run(`document.body.textContent.includes('Server capacity')`));
  assert.ok(await run(`document.body.textContent.includes('STALE')`),'missing/stale data must be explicit');
  assert.ok(await run(`document.body.textContent.includes('blocking transaction')`),'show a concrete scaling diagnosis');
  assert.equal(await run(`document.querySelectorAll('img[src=x]').length`),0,'container labels are text, never HTML');
  assert.ok(await run(`document.querySelectorAll('svg[aria-label*="CPU and memory"]').length>=2`));
  await run(`document.querySelector('[aria-label="Capacity history range"]').value='168';document.querySelector('[aria-label="Capacity history range"]').dispatchEvent(new Event('change'));`);await new Promise(r=>setTimeout(r,150));
  assert.ok(await run(`__capacityCalls.some(x=>x.includes('hours=168'))`));
  await run(`(async()=>{state.role='support_admin';await loadTabData('support');})()`);
  assert.ok(await run(`[...document.querySelectorAll('h2')].find(x=>x.textContent==='Server capacity').parentElement.hidden`),'limited roles must not retain capacity data');
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fixture.identifier});
  console.log('Capacity dashboard passed: actual admin page, two host charts, stale samples, scaling advice, seven-day range, escaped labels and role cleanup.');
 }finally{socket.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
