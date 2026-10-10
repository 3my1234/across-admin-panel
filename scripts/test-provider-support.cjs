const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../provider.js'), 'utf8');
async function main() {
  const elements = new Map(), pending = [];
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {textContent:'',innerHTML:'',disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelectorAll(){return []},reset(){}});
    return elements.get(id);
  };
  const state={token:'provider'};
  const ctx = vm.createContext({state,$,Map,Date,String,encodeURIComponent,escapeHtml:s=>String(s).replaceAll('<','&lt;'),
    setMessage:(message,_ok,id)=>{$(id).textContent=message;},
    FormData:class { constructor(form){this.fields=form.fields;} *[Symbol.iterator](){yield* this.fields;} },
    api:(url,options)=>new Promise((resolve,reject)=>pending.push({url,options,resolve,reject}))});
  vm.runInContext(source.slice(source.indexOf('  let supportTickets ='), source.indexOf('  async function refreshVisibleProviderPage()')),ctx);
  let task=ctx.loadProviderSupport();pending.shift().resolve({tickets:[{id:'one',subject:'Bank help',status:'open',created_at:'2026-10-10'}],next_cursor:'page2'});await task;
  task=ctx.loadProviderSupport(true);assert.match(pending[0].url,/cursor=page2/);pending.shift().resolve({tickets:[{id:'old',subject:'Old help',created_at:'2026-10-01'}]});await task;
  task=ctx.loadProviderSupport();pending.shift().resolve({tickets:[{id:'one',subject:'Bank help',status:'responded',created_at:'2026-10-10'}],next_cursor:'page2'});await task;
  assert.match($('providerSupportTickets').innerHTML,/Old help/,'refresh retains loaded history');
  vm.runInContext('supportTicket={id:"one",subject:"Bank help"}',ctx);
  task=ctx.openProviderSupport();pending.shift().resolve({messages:[{id:'recent',sender_type:'admin',message:'<unsafe>',created_at:'2026-10-10'}],next_cursor:'earlier'});await task;
  assert.match($('providerSupportMessages').innerHTML,/Atlantic Express Support/);assert.match($('providerSupportMessages').innerHTML,/&lt;unsafe>/);
  task=ctx.openProviderSupport(true);assert.match(pending[0].url,/cursor=earlier/);pending.shift().resolve({messages:[{id:'old-message',sender_type:'user',message:'Earlier question',created_at:'2026-10-01'}]});await task;
  task=ctx.openProviderSupport();pending.shift().resolve({messages:[{id:'recent',sender_type:'admin',message:'Answer',created_at:'2026-10-10'}]});await task;
  assert.match($('providerSupportMessages').innerHTML,/Earlier question/);
  const button={disabled:false}, form={fields:[['message','Thank you']],querySelector:()=>button,reset(){}};
  task=ctx.sendProviderSupport({preventDefault(){},currentTarget:form},true);
  await ctx.sendProviderSupport({preventDefault(){},currentTarget:form},true);
  assert.equal(pending.length,1,'double submission sends only one reply');assert.match(pending[0].url,/one\/reply$/);
  pending.shift().resolve({});await new Promise(r=>setImmediate(r));pending.shift().resolve({tickets:[]});await new Promise(r=>setImmediate(r));pending.shift().resolve({messages:[]});await task;
  assert.equal(button.disabled,false);
  task=ctx.loadProviderSupport();state.token='another-provider';ctx.resetProviderSupport();pending.shift().resolve({tickets:[{id:'private',subject:'Private old session'}]});await task;
  assert.equal($('providerSupportTickets').innerHTML.includes('Private old session'),false);
  const admin=fs.readFileSync(path.join(__dirname,'../app.20260927.js'),'utf8');let loggedOut=0;
  const auth=vm.createContext({state:{token:'admin',apiUrl:'https://example.test'},AbortController,setTimeout,clearTimeout,Error,TypeError,
    fetch:async()=>({status:401,ok:false,text:async()=>'{"message":"expired"}'}),logout(){loggedOut++;},setText(){}});
  vm.runInContext(admin.slice(admin.indexOf('async function request('),admin.indexOf('function updateListControls(')),auth);
  await assert.rejects(auth.request('/api/v1/admin/waitlist'),error=>error.status===401);assert.equal(loggedOut,1);
  console.log('Provider support passed: paginated history, replies, escaped content, duplicate guards, session isolation; admin 401 recovery.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
