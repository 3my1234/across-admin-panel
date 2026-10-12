const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const code=fs.readFileSync("provider-updates.js","utf8");
function boot({waiting=true,controlled=true}={}) {
 const events={},workerEvents={},pageEvents={},nodes=[];let reloads=0,checks=0,posted=[];
 const node=()=>({hidden:false,children:[],listeners:{},append(...items){this.children.push(...items);},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;}});
 const updateWorker={postMessage:value=>posted.push(value)};
 const registration={waiting:waiting?updateWorker:null,installing:null,update:async()=>{checks++;},addEventListener:(name,fn)=>workerEvents[name]=fn};
 const context={window:{addEventListener:(name,fn)=>pageEvents[name]=fn},document:{hidden:false,createElement:node,body:{prepend:n=>nodes.push(n)},addEventListener:(name,fn)=>pageEvents[name]=fn},navigator:{onLine:true,serviceWorker:{controller:controlled?{}:null,addEventListener:(name,fn)=>events[name]=fn}},location:{reload:()=>reloads++},setInterval:()=>{},setTimeout:()=>{},Date,Promise,WeakSet};
 vm.runInNewContext(code,context);context.window.ProviderAppUpdates.watch(Promise.resolve(registration));
 return {events,registration,pageEvents,nodes,context,posted,reloads:()=>reloads,checks:()=>checks};
}
(async()=>{
 const t=boot();await new Promise(resolve=>setImmediate(resolve));const bar=t.nodes[0],button=bar.children[1];assert.equal(bar.hidden,false);assert.equal(t.checks(),1);assert.equal(t.reloads(),0,"an available update must not discard a draft");
 button.listeners.click();assert.equal(t.posted[0].type,"ACTIVATE_PROVIDER_UPDATE");assert.equal(t.reloads(),0,"reload only after activation");t.events.controllerchange();t.events.controllerchange();assert.equal(t.reloads(),1,"refresh once after explicit approval");
 const other=boot({waiting:false});await new Promise(resolve=>setImmediate(resolve));assert.equal(other.nodes[0].hidden,true);other.events.controllerchange();assert.equal(other.nodes[0].hidden,false);assert.equal(other.reloads(),0,"another tab activating an update does not discard this tab's work");other.nodes[0].children[1].listeners.click();assert.equal(other.reloads(),1);
 const first=boot({waiting:false,controlled:false});await new Promise(resolve=>setImmediate(resolve));first.events.controllerchange();assert.equal(first.nodes[0].hidden,true,"initial installation isn't an app update");assert.equal(first.reloads(),0);
 console.log("Provider updates passed: waiting-update prompt, explicit activation, one reload, other-tab work preservation and first-install handling.");
})().catch(error=>{console.error(error);process.exitCode=1;});
