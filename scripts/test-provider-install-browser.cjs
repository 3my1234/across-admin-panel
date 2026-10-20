const assert=require('node:assert/strict');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9224/json')).json();
 const socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
 let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const task=pending.get(data.id);pending.delete(data.id);data.error?task.reject(data.error):task.resolve(data.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 let preload;
 try{
  await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
  preload=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
   localStorage.removeItem('atlantic.provider.token');window.__installCalls=0;window.__updateCalls=0;window.__errors=[];addEventListener('error',e=>__errors.push(e.message));
   window.__sw={waiting:null,installing:null,update:async()=>{},addEventListener:(name,fn)=>{__sw[name]=fn;}};
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{controller:{},register:async()=>__sw,addEventListener(){}}});
   const realFetch=fetch.bind(window);window.fetch=(input,options)=>String(input).startsWith('https://api.atlxpres.com/')?Promise.resolve(new Response(JSON.stringify({items:[],markets:[]}))):realFetch(input,options);
  `});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:(process.env.COMMUNITY_TEST_ORIGIN||'http://127.0.0.1:5176')+'/provider.html'});
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const check=()=>{if(window.ProviderAppUpdates&&document.querySelector('#providerInstallEntry:not([hidden])')&&__sw.updatefound)return resolve();if(++n>150)return reject(Error('Pre-login install entry did not appear'));setTimeout(check,30);};check();})`);
  assert.equal(await evaluate(`document.body.classList.contains('auth-mode')`),true);
  await evaluate(`document.querySelector('[data-provider-install]').click()`);
  assert.equal(await evaluate(`document.querySelector('.provider-install-dialog').open`),true);
  const centered=`(selector)=>{const box=document.querySelector(selector).getBoundingClientRect();return Math.abs(box.x+box.width/2-innerWidth/2)<2&&Math.abs(box.y+box.height/2-innerHeight/2)<2&&box.width<=innerWidth-24;}`;
  assert.equal(await evaluate(`(${centered})('.provider-install-dialog')`),true,'manual install guidance is centered and fits a phone');
  await evaluate(`document.querySelector('.provider-install-dialog button').click();const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{__installCalls++;};event.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(event);document.querySelector('[data-provider-install]').click();new Promise(resolve=>setTimeout(resolve,30))`);
  assert.equal(await evaluate('__installCalls'),1);
  await evaluate(`document.querySelector('#loginForm input[name=email]').value='unsent@example.invalid';__sw.waiting={postMessage(){__updateCalls++;}};__sw.installing={state:'installed',addEventListener(name,fn){this.changed=fn;}};__sw.updatefound();__sw.installing.changed()`);
  assert.equal(await evaluate(`document.querySelector('.provider-update-dialog').open`),true);
  assert.equal(await evaluate(`(${centered})('.provider-update-dialog')`),true,'update is a centered modal, not a top banner');
  await evaluate(`document.querySelector('.provider-update-dialog .secondary').click()`);
  assert.equal(await evaluate(`document.querySelector('#loginForm input[name=email]').value`),'unsent@example.invalid','Later preserves entered work');
  assert.equal(await evaluate('__updateCalls'),0);
  await evaluate(`dispatchEvent(new Event('appinstalled'))`);
  assert.equal(await evaluate(`document.querySelector('#providerInstallEntry').hidden`),true);
  assert.deepEqual(await evaluate('__errors'),[]);
  console.log('Provider install/update browser passed: visible before login, native prompt trigger, phone-fit centered dialogs, Later preserves input, installed state.');
 }finally{if(preload)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:preload.identifier});socket.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
