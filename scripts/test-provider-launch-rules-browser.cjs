/* Real Chrome against local files and synthetic API replies; no production calls. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9224/json')).json(),socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 try{
 await send('Page.enable');await send('Page.navigate',{url:'http://127.0.0.1:5176/provider.html'});await run(`new Promise((resolve,reject)=>{let n=0;const wait=()=>{if(document.readyState==='complete'&&document.querySelector('[data-password-toggle]'))return resolve();if(++n>200)return reject(Error('Not ready'));setTimeout(wait,40)};wait()})`);
 assert.equal(await run(`(()=>{const f=document.querySelector('#signupForm [name=password]');document.querySelector('#signupForm [data-password-toggle]').click();return f.type})()`),'text');
 assert.equal(await run(`(()=>{document.querySelector('#signupForm [data-password-toggle]').click();return document.querySelector('#signupForm [name=password]').type})()`),'password');
 assert.ok(await run(`document.querySelector('#signupPasswordHelp').textContent.includes('uppercase')`));
 await run(`(()=>{window.__authCalls=0;const original=fetch;window.fetch=(...args)=>{if(String(args[0]).includes('/auth/signup')){__authCalls++;throw Error('Unexpected signup call');}return original(...args)};const f=document.querySelector('#signupForm');f.elements.full_name.value='Synthetic Owner';f.elements.email.value='owner@example.test';f.elements.phone.value='07012345678';f.elements.password.value='password123';f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
 assert.equal(await run(`__authCalls`),0,'weak passwords rejected before API submission');
 assert.ok(await run(`document.querySelector('#signupMessage').textContent.includes('uppercase')`));
 assert.equal(await run(`Boolean(document.querySelector('#onboardingForm [name=is_driver]'))`),true);
 for(const type of ['drivers_license','driver_vehicle','driver_plate'])assert.ok(await run(`Boolean(document.querySelector('#verificationForm option[value="${type}"]'))`));
 await run(`(()=>{const s=document.querySelector('#verificationForm [name=document_type]');s.value='drivers_license';s.dispatchEvent(new Event('change'))})()`);
 assert.equal(await run(`document.querySelector('#verificationFile').accept.includes('application/pdf')`),false);
 const source=fs.readFileSync(path.join(__dirname,'../provider.js'),'utf8'),helpers=source.slice(source.indexOf('  async function loadPostPolicy()'),source.indexOf('  async function loadPlans()'));
 await run(`(()=>{window.__videoCalls=[];window.__videoFiles=[];window.__policy={max_videos:0};const state={listingRetainedVideos:[]};const make=new Function('state','$','api','PortalStorageUpload','setMessage','escapeHtml',${JSON.stringify(helpers)}+';return {loadPostPolicy,postVideos};');window.__videos=make(state,()=>({files:__videoFiles}),async(url,options)=>{__videoCalls.push(url);if(url.endsWith('post-policy'))return __policy;if(url.endsWith('presign'))return {key:'private/candidate'};return {url:'https://example.test/verified.mp4'};},{upload:async()=>{}},()=>{},v=>v);})()`);
 await run(`__videos.loadPostPolicy();__videoFiles=[{type:'video/mp4',size:100,name:'test.mp4'}]`);
 assert.ok((await run(`__videos.postVideos('listing').then(()=>'',e=>e.message)`)).includes('Upgrade'));
 assert.equal(await run(`__videoCalls.filter(p=>p.endsWith('presign')).length`),0);
 await run(`__policy={max_videos:2};__videos.loadPostPolicy()`);
 assert.equal(await run(`__videos.postVideos('listing').then(v=>v.length)`),1);
 assert.equal(await run(`__videoCalls.at(-1)`),'/providers/me/videos/complete','video is verified before being attached');
 await run(`__videoFiles=Array.from({length:3},()=>({type:'video/mp4',size:100,name:'test.mp4'}))`);
 assert.ok((await run(`__videos.postVideos('listing').then(()=>'',e=>e.message)`)).includes('2 videos'));
 await run(`(async()=>{const element=document.createElement('div');document.body.append(element);window.__iconElement=element;window.__iconPortal=CommunityPortal.create({element,getActor:()=> 'synthetic-inbox',request:async()=>({items:[{id:'11111111-1111-4111-8111-111111111111',source:'shared',kind:'direct',title:'I need a lift',state:'open',context:{town_hall_request_id:'22222222-2222-4222-8222-222222222222'},unread_count:0}],next_cursor:''})});await __iconPortal.activate({mode:'chats'});})()`);
 assert.ok(await run(`Boolean(__iconElement.querySelector('.chat-avatar svg'))`),'Town Hall origin uses the civic icon');
 console.log('Provider launch UI PASS: password toggle/validation, driver photo types, video upgrade/caps/verification and Town Hall origin icon');
 }finally{await run(`window.__iconPortal?.reset();window.__iconElement?.remove()`).catch(()=>{});socket.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
