const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('provider-pwa.js','utf8').split(' const nav=document.createElement("nav");')[0]+'})();';
function fixture({permission='granted',fail=false,ready=true}={}){
 let clock=1000000,actor='provider-one',requests=[],posts=0,prompts=0,attempts=0,observer;
 const events={},timers=new Map(),intervals=[],elements={};let sequence=0;
 for(const id of ['installProviderApp','enableProviderNotifications','providerPushStatus'])elements[id]={textContent:'',classList:{add(){},remove(){}},after(){},addEventListener(name,fn){this[name]=fn;}};
 const key=Buffer.alloc(65,1).toString('base64url'),subscription={endpoint:'https://fcm.googleapis.com/fixture',options:{applicationServerKey:Buffer.alloc(65,1)},unsubscribe:async()=>{}};
 const worker={pushManager:{getSubscription:async()=>subscription}};
 const listeners=(prefix,name,fn)=>events[prefix+name]=fn;
 const context={window:null,document:{body:{},hidden:false,createElement:()=>({classList:{add(){},remove(){}}}),getElementById:id=>elements[id],addEventListener:(name,fn)=>listeners('doc:',name,fn)},localStorage:{getItem:()=>actor},navigator:{onLine:true,serviceWorker:{register:async()=>worker,ready:ready?Promise.resolve(worker):new Promise(()=>{})}},Notification:{permission,requestPermission:async()=>{prompts++;return permission;}},PushManager:function(){},ProviderAppUpdates:{watch(){}},MutationObserver:class{constructor(fn){observer=fn;}observe(){}},URL,Uint8Array,AbortController,Date:{now:()=>clock},atob:value=>Buffer.from(value,'base64').toString('binary'),setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn),fetch:async(url,options)=>{requests.push([url,options]);if(url.endsWith('/key')){attempts++;if(fail){fail=false;throw Error('offline');}return {ok:true,status:200,json:async()=>({enabled:true,public_key:key})};}posts++;return {ok:true,status:204};},addEventListener:(name,fn)=>listeners('win:',name,fn)};
 context.window=context;vm.runInNewContext(source,context);
 return {context,elements,events,timers,intervals,advance:ms=>clock+=ms,actor:value=>{actor=value;observer();},stats:()=>({posts,prompts,attempts}),requests};
}
const settle=async()=>{for(let n=0;n<12;n++)await new Promise(r=>setImmediate(r));};
(async()=>{
 const retry=fixture({fail:true});await settle();assert.match(retry.elements.providerPushStatus.textContent,/could not connect/);assert.equal(retry.stats().posts,0);
 retry.advance(31000);retry.events['win:online']();await settle();assert.equal(retry.stats().posts,1,'reconnection registers previously failed browser');assert.match(retry.elements.providerPushStatus.textContent,/registered/);assert.equal(retry.stats().prompts,0,'recovery never prompts for permission');
 retry.events['doc:visibilitychange']();retry.intervals[0]();await settle();assert.equal(retry.stats().posts,1,'successful registration is throttled');
 retry.actor('provider-two');await settle();assert.equal(retry.stats().posts,2,'account change rebinds browser immediately');assert.equal(retry.requests.at(-1)[1].headers.Authorization,'Bearer provider-two');
 const denied=fixture({permission:'denied'});await settle();assert.match(denied.elements.providerPushStatus.textContent,/blocked/);assert.equal(denied.stats().posts,0);assert.equal(denied.stats().prompts,0);
 const pending=fixture({permission:'default'});await settle();assert.match(pending.elements.providerPushStatus.textContent,/Enable phone notifications/);assert.equal(pending.stats().prompts,0);
 const waiting=fixture({ready:false});await settle();const deadline=[...waiting.timers.values()].find(timer=>timer.ms===12000);assert.ok(deadline);deadline.fn();await settle();assert.match(waiting.elements.providerPushStatus.textContent,/could not connect/,'stalled worker does not leave setup stuck');assert.equal(waiting.elements.enableProviderNotifications.textContent,'Retry phone notifications');
 const soundSource=fs.readFileSync('provider.js','utf8').split('  let alertAudio=null;')[1].split('  function renderProviderNotifications()')[0];
 let contexts=0,resumes=0,tones=0;const audioEvents={};
 class Audio {constructor(){contexts++;this.state='suspended';this.currentTime=0;this.destination={};}async resume(){resumes++;this.state='running';}async close(){this.state='closed';}createOscillator(){tones++;return {frequency:{},connect(){},start(){},stop(){},disconnect(){}};}createGain(){return {gain:{},connect(){},disconnect(){}};}}
 const audio={window:{AudioContext:Audio,addEventListener:(name,fn)=>audioEvents[name]=fn},document:{addEventListener:(name,fn)=>audioEvents[name]=fn}};
 vm.createContext(audio);vm.runInContext('let alertAudio=null;'+soundSource+';globalThis.play=playProviderAlert;',audio);
 audio.play();assert.equal(contexts,0,'polling must not create blocked audio before interaction');audioEvents.pointerdown();await settle();audio.play();audio.play();assert.equal(contexts,1);assert.equal(resumes,1);assert.equal(tones,2,'unlocked context is reused');audioEvents.pagehide();audioEvents.keydown();await settle();audio.play();assert.equal(contexts,2,'page resume can unlock a fresh context');
 console.log('Provider push recovery passed: offline retry, throttling, account switch, permission, worker deadline and gesture-unlocked reusable audio.');
})().catch(error=>{console.error(error);process.exitCode=1;});
