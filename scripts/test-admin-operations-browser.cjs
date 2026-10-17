/* Run against the isolated local server/CDP browser; all API actions are stubbed. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9224/json')).json();
 const socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 try {
  await send('Page.enable');
  for(const width of [390,853,1440])for(const theme of ['light','dark']){
   await send('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:width<768});
   await send('Page.navigate',{url:'http://127.0.0.1:5176/index.html'});
   await run(`new Promise((resolve,reject)=>{let n=0;const poll=()=>{if(document.querySelector('.atl-settings-button')&&typeof loadTabData==='function'&&document.querySelector('.operations-search'))return resolve();if(++n>150)return reject(Error('Admin not ready'));setTimeout(poll,40)};poll()})`);
   await run(`(()=>{
    document.documentElement.dataset.theme=${JSON.stringify(theme)};document.getElementById('authPanel').classList.add('hidden');document.getElementById('dashboard').classList.remove('hidden');state.role='super_admin';state.token='synthetic-local-test';state.adminId='synthetic-admin';window.__calls=[];window.__xp=[];window.confirm=()=>true;
    document.getElementById('sessionName').textContent='Super Admin';document.getElementById('sessionRole').textContent='Super Admin · super_admin';document.getElementById('paymentReconciliationForm').classList.remove('hidden');
    document.querySelectorAll('.side-nav [data-tab]').forEach(b=>b.classList.toggle('hidden',!allowedTabsForRole('super_admin').includes(b.dataset.tab)));
    const date='2026-10-09T15:27:52Z';
    window.__orders=[{id:'order-1',email:'buyer@example.test',status:'pending',stage:'Order Placed',total_amount:20.2,platform_fee:.2,created_at:date},{id:'order-2',email:'buyer@example.test',status:'completed',stage:'Delivered',total_amount:1121.1,platform_fee:11.1,created_at:date}];
    window.__transactions=[{order_id:'order-1',email:'buyer@example.test',provider:'flutterwave',purpose:'order',payment_status:'processing',provider_reference:'ACROSS-synthetic',refund_status:'none',chargeback_status:'none',settlement_status:'pending',total_amount:20.2,currency:'NGN'},{order_id:'subscription-1',email:'provider@example.test',provider:'flutterwave',purpose:'provider_subscription',payment_status:'succeeded',refund_status:'none',chargeback_status:'none',total_amount:500,currency:'NGN'}];
    window.__tickets=[{id:'ticket-1',subject:'My subscription',user_email:'buyer@example.test',status:'open',message:'Please help with my subscription.',created_at:date,updated_at:date},{id:'ticket-2',subject:'Arrival date',user_email:'buyer@example.test',status:'responded',created_at:date,updated_at:date}];
    request=async(url,options={})=>{__calls.push({url,options});
     if(url.includes('/xp/withdrawals/')){__xp[0].status=options.body.status;return {}};
     if(url.includes('/xp/withdrawals'))return {items:__xp};
     if(url.includes('/payments/flutterwave/reconcile'))return {payment_state:'confirmed',order_id:'order-1'};
     if(url.includes('/admin/orders'))return {orders:__orders,page:{total:33,has_more:true,next_cursor:'next'}};
     if(url.includes('/admin/transactions'))return {transactions:__transactions,page:{total:2,has_more:false}};
     if(url.includes('/analytics/complaints')){if(options.method==='POST')await new Promise(r=>setTimeout(r,25));return {complaints:[]};}
     if(url.includes('/support/tickets/')&&url.includes('/messages'))return {messages:[{id:'message-1',sender_type:'user',message:'Please help with my subscription.',created_at:date}]};
     if(url.includes('/support/tickets/')&&url.includes('/read'))return {unread_count:0};
     if(url.includes('/support/tickets'))return {tickets:__tickets};
     return {};
    };
   })()`);
   for(const tab of ['orders','transactions','xp-withdrawals','complaints','support']){
    await run(`(async()=>{state.activeTab=${JSON.stringify(tab)};document.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!==state.activeTab));document.querySelectorAll('.side-nav [data-tab]').forEach(p=>p.classList.toggle('active',p.dataset.tab===state.activeTab));await loadTabData(state.activeTab,{force:true});})()`);
    const geo=await run(`({scroll:document.documentElement.scrollWidth,active:document.body.classList.contains('operations-view'),panel:document.querySelector('[data-panel="${tab}"]').getBoundingClientRect().width,settings:document.querySelectorAll('.atl-settings-button').length})`);
    assert.equal(geo.active,true);assert.equal(geo.settings,1);assert.ok(geo.scroll<=width+1,`${width}/${theme}/${tab} overflow: ${JSON.stringify(geo)}`);
    if(tab==='orders'){assert.equal(await run(`document.querySelector('#ordersTable [data-status=pending]').textContent`),'pending');assert.equal(await run(`document.querySelector('#ordersTable [data-status=completed]').textContent`),'completed');}
    if(tab==='xp-withdrawals')assert.equal(await run(`document.getElementById('xpWithdrawalEmpty').classList.contains('hidden')`),false);
    if(tab==='support')assert.equal(await run(`document.querySelector('#ticketsTable [data-status=responded]').textContent`),'responded');
    if(width===1440&&process.env.ADMIN_OPERATIONS_SCREENSHOTS){const dir=process.env.ADMIN_OPERATIONS_SCREENSHOTS;fs.mkdirSync(dir,{recursive:true});const size=(await send('Page.getLayoutMetrics')).cssContentSize;const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:Math.min(3000,size.height),scale:1}});fs.writeFileSync(path.join(dir,`${tab}-${theme}.png`),Buffer.from(shot.data,'base64'));}
   }
   // Actual controls remain attached after the presentation changes.
   await run(`(async()=>{document.querySelector('#ticketsTable [data-action=view-ticket]').click();await new Promise(r=>setTimeout(r,60));})()`);
   assert.equal(await run(`document.getElementById('ticketMessages').classList.contains('hidden')`),false);
   assert.ok(await run(`document.getElementById('ticketMessagesList').textContent.includes('Please help')`));
   await run(`document.getElementById('closeTicketView').click();document.querySelector('.atl-settings-button').click()`);
   assert.equal(await run(`document.querySelector('.atl-settings').open`),true);
   await run(`(async()=>{document.querySelector('.atl-settings').close();const f=document.getElementById('complaintForm');f.elements.description.value='Synthetic complaint';f.elements.user_email.value='buyer@example.test';f.elements.product_id.value='22222222-2222-4222-8222-222222222222';f.requestSubmit();f.requestSubmit();await new Promise(r=>setTimeout(r,80));})()`);
   assert.equal(await run(`__calls.filter(c=>c.url.includes('/analytics/complaints')&&c.options.method==='POST').length`),1,'complaint must not submit twice');
   assert.equal(await run(`document.getElementById('complaintStatus').textContent`),'Complaint logged.');
   assert.equal(await run(`__calls.find(c=>c.url.includes('/analytics/complaints')&&c.options.method==='POST').options.body.user_email`),'buyer@example.test');
   assert.equal(await run(`document.querySelector('#complaintForm button[type=submit]').disabled`),false);
   await run(`document.querySelector('.atl-settings').close();state.activeTab='xp-withdrawals';__xp=[{id:'withdrawal-1',points:1000,status:'pending',email:'buyer@example.test',bank_name:'Synthetic bank',account_number:'0000000000',account_name:'Synthetic account',created_at:new Date().toISOString()}];loadTabData('xp-withdrawals')`);
   assert.equal(await run(`document.getElementById('xpWithdrawalEmpty').classList.contains('hidden')`),true);
   assert.equal(await run(`document.querySelectorAll('#xpWithdrawalList form').length`),1);
   await run(`document.querySelector('#xpWithdrawalList form').requestSubmit();new Promise(r=>setTimeout(r,60))`);
   assert.equal(await run(`__calls.some(c=>c.options.method==='PATCH'&&c.options.body.status==='processing')`),true);
   await run(`state.orders=[{email:'<img src=x onerror="window.__xss=true">',status:'pending'}];renderNamedList('orders')`);
   assert.equal(await run(`document.querySelectorAll('#ordersTable img').length`),0);
  }
  console.log('Admin operations browser passed: five screens, both themes, three widths, withdrawals/reviews, Support, Settings, complaint email/single submit and escaped table values.');
 } finally {socket.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
