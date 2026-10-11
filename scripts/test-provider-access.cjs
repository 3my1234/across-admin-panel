const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('provider-admin.js','utf8');
const nodes={providerAccessMode:{value:'free'},providerPaidStartAt:{value:''}},button={disabled:false},state={};
let calls=[],rendered=0,resolvePending;
const g={state,$:id=>nodes[id],confirm:()=>true,setText:()=>{},renderProviderAccess:()=>rendered++,request:async(path,options)=>{calls.push(options.body);return {enforced:options.body.enforced,required:options.body.enforced,start_at:options.body.start_at};}};
vm.createContext(g);vm.runInContext(source.slice(source.indexOf('  async function saveProviderAccess('),source.indexOf('  function queryParams(')),g);
const event={preventDefault(){},currentTarget:{querySelector:()=>button}};
(async()=>{
 for(const mode of ['free','paid','free']) {nodes.providerAccessMode.value=mode;await g.saveProviderAccess(event);assert.equal(state.providerAccess.enforced,mode==='paid');assert.equal(button.disabled,false);}
 assert.deepEqual(calls.map(x=>x.enforced),[false,true,false]);assert.equal(rendered,3);
 nodes.providerPaidStartAt.value='2026-12-01T12:00';nodes.providerAccessMode.value='free';await g.saveProviderAccess(event);assert.equal(calls.at(-1).start_at,null,'free cancels any schedule');
 g.request=()=>new Promise(resolve=>resolvePending=resolve);const pending=g.saveProviderAccess(event);const before=calls.length;await g.saveProviderAccess(event);assert.equal(calls.length,before);assert.equal(button.disabled,true);resolvePending({enforced:false,required:false,start_at:null});await pending;assert.equal(button.disabled,false);
 g.request=async()=>{throw Error('save failed')};const previous=state.providerAccess;await g.saveProviderAccess(event);assert.equal(state.providerAccess,previous,'failed save must not claim changed policy');assert.equal(button.disabled,false);
 console.log('Admin access controls passed: Free/Paid/Free, schedule clearing, duplicate-submit guard and failed-save state.');
})().catch(e=>{console.error(e);process.exitCode=1;});
