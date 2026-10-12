// Node 22; attach to an isolated headless Chrome on 9224 and local server 5175.
const fs=require('node:fs'),assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9224/json')).json(),socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 try{
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__errors=[];addEventListener('error',event=>window.__errors.push(event.message));`});
  for(const width of [320,390,768,1440]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
   await send('Page.navigate',{url:'http://127.0.0.1:5175/provider.html'});await delay(800);
   assert.equal(await evaluate('window.__errors.length'),0);
   await evaluate(`document.body.classList.remove('auth-mode');document.getElementById('authPanel').classList.add('hidden');document.getElementById('portal').classList.remove('hidden');`);
   const layout=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,nav:getComputedStyle(document.querySelector('.provider-mobile-nav')).display})`);
   assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));assert.equal(layout.nav,width<=850?'flex':'none');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.getElementById('conversationDialog').showModal();document.getElementById('conversationMessages').innerHTML='<button data-chat-photo="http://127.0.0.1:5175/provider-icon-512.png">Photo</button>';document.querySelector('[data-chat-photo]').click();`);
  await delay(100);
  const photo=await evaluate(`({open:document.querySelector('.chat-photo-viewer').open,src:document.querySelector('.photo-canvas img').src,width:document.querySelector('.chat-photo-viewer').getBoundingClientRect().width})`);
  assert.ok(photo.open&&photo.width===390);assert.ok(photo.src.endsWith('provider-icon-512.png'));
  await evaluate(`document.querySelector('[data-photo-in]').click()`);
  assert.ok((await evaluate(`document.querySelector('.photo-canvas img').style.transform`)).includes('scale(1.5)'));
  await evaluate(`document.querySelector('[data-photo-reset]').click()`);
  const center=await evaluate(`(()=>{const r=document.querySelector('.photo-canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const points=distance=>[{x:center.x-distance,y:center.y,id:1},{x:center.x+distance,y:center.y,id:2}];
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(30)});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(60)});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok((await evaluate(`document.querySelector('.photo-canvas img').style.transform`)).includes('scale(2)'));
  await evaluate(`history.back()`);await delay(100);
  assert.equal(await evaluate(`document.querySelector('.chat-photo-viewer').open`),false);assert.equal(await evaluate(`document.getElementById('conversationDialog').open`),true);
  const keyboard=await evaluate(`document.documentElement.style.setProperty('--visible-viewport-height','450px');(()=>{const r=document.getElementById('conversationDialog').getBoundingClientRect();return {height:r.height,composerBottom:document.getElementById('conversationReplyForm').getBoundingClientRect().bottom};})()`);
  assert.ok(keyboard.height<=451&&keyboard.composerBottom<=451,JSON.stringify(keyboard));
  console.log('Provider browser passed: 320/390/768/1440 layout, mobile navigation, modal photo zoom/pinch/back and reduced-height composer.');
 }finally{socket.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
