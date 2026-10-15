const assert=require('node:assert/strict');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9224/json')).json(),socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const task=pending.get(data.id);pending.delete(data.id);data.error?task.reject(data.error):task.resolve(data.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const run=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 try{
  await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
  await send('Page.navigate',{url:(process.env.COMMUNITY_TEST_ORIGIN||'http://127.0.0.1:5176')+'/provider.html'});
  await run(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{if(window.ListingImages&&window.CommunityTownHall)return resolve();if(++tries>100)return reject(Error('Launch assets missing'));setTimeout(poll,30)};poll()})`);
  assert.equal(await run(`(async()=>{const c=document.createElement('canvas');c.width=2200;c.height=1800;const ctx=c.getContext('2d'),data=ctx.createImageData(c.width,c.height);let seed=7;for(let i=0;i<data.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;data.data[i]=seed&255;data.data[i+1]=(seed>>>8)&255;data.data[i+2]=(seed>>>16)&255;data.data[i+3]=255;}ctx.putImageData(data,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const file=new File([blob],'photo.png',{type:'image/png'}),result=await ListingImages.prepare(file),bitmap=await createImageBitmap(result);const valid=result.size<file.size&&Math.max(bitmap.width,bitmap.height)<=1600&&result.type==='image/webp';bitmap.close();return valid;})()`),true,'large new listing photos downsize and preserve a decodable MIME type');
  assert.equal(await run(`(async()=>{const tiny=new File(['small'],'small.png',{type:'image/png'}),gif=new File([new Uint8Array(500000)],'animated.gif',{type:'image/gif'});return await ListingImages.prepare(tiny)===tiny&&await ListingImages.prepare(gif)===gif;})()`),true,'small photos and animated formats stay original');
  await run(`(async()=>{window.__hallHost=document.createElement('section');document.body.append(__hallHost);window.__holdHall=false;window.__hallId='11111111-1111-4111-8111-111111111111';const room={id:__hallId,title:'Rice for my event',description:'Rice for my event',message_only:true,buyer_name:'Amina',created_at:new Date().toISOString(),seats:0,state:'open',admitted:false,is_owner:false,offers:[]};await CommunityTownHall.mount({element:__hallHost,getActor:()=> 'test',openChat:async()=>{},request:async path=>{if(__holdHall)await new Promise(r=>window.__releaseHall=r);return path.includes('?')?{items:[room]}:room;}});})()`);
  await run(`__holdHall=true;__hallHost.querySelector('[data-hall-refresh]').click()`);
  assert.equal(await run(`__hallHost.querySelectorAll('button[aria-busy=true]').length===1&&[...__hallHost.querySelectorAll('button')].filter(b=>b.disabled).length===1&&!__hallHost.querySelector('[data-hall-detail]').disabled`),true,'refresh changes only its own button');
  await run(`__holdHall=false;__releaseHall();new Promise(r=>setTimeout(r,30))`);
  await run(`__holdHall=true;__hallHost.querySelector('[data-hall-detail]').click()`);
  assert.equal(await run(`__hallHost.querySelectorAll('button[aria-busy=true]').length===1&&!__hallHost.querySelector('[data-hall-refresh]').disabled&&!__hallHost.querySelector('[data-hall-mine]').disabled`),true,'entering a conversation does not press neighbouring buttons');
  await run(`__holdHall=false;__releaseHall();new Promise(r=>setTimeout(r,30))`);
  await run(`__holdHall=true;__hallHost.querySelector('[data-hall-refresh]').click()`);
  assert.equal(await run(`!__hallHost.querySelector('[data-hall-back]').disabled&&!__hallHost.querySelector('[data-hall-apply]').disabled`),true,'room refresh leaves Back and Ask to join unchanged');
  await run(`__holdHall=false;__releaseHall();new Promise(r=>setTimeout(r,30))`);
  console.log('Launch browser passed: large photo downsize/decoding, original-file exceptions and isolated action feedback under stalled requests.');
 }finally{socket.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
