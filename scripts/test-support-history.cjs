const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.20260927.js'),'utf8');
async function main(){
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'all',disabled:false,textContent:'',classList:{toggle(){},add(){},remove(){}},addEventListener(){}});return elements.get(id);};
 const state={token:'admin',supportTickets:[]};let pending=[],rendered=[];
 const ctx=vm.createContext({state,$,setText:(id,text)=>{$(id).textContent=text;},renderTicketsTable:rows=>{rendered=rows;},sendTicketReply(){},request:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))});
 vm.runInContext(source.slice(source.indexOf('let currentTicketId = null;'),source.indexOf('function renderTicketsTable(')),ctx);
 let request=ctx.loadTickets();const coalesced=ctx.loadTickets();await coalesced;assert.equal(pending.length,1);
 pending.shift().resolve({tickets:[{id:'latest',updated_at:'2026-10-07',status:'open'}],next_cursor:'page2'});await request;
 request=ctx.loadTickets('page2');assert.match(pending[0].url,/cursor=page2/);pending.shift().resolve({tickets:[{id:'older-answered',updated_at:'2026-10-01',status:'responded'}]});await request;assert.equal(rendered.length,2);
 request=ctx.loadTickets();pending.shift().resolve({tickets:[{id:'latest',updated_at:'2026-10-08',status:'open'}],next_cursor:'page2'});await request;assert.equal(rendered.length,2,'background refresh must retain loaded earlier tickets');
 request=ctx.loadTickets();pending.shift().reject(new Error('Offline'));await request;assert.equal(rendered.length,2);assert.equal($('ticketListStatus').textContent,'Offline','list errors must be visible outside the closed thread panel');
 $('ticketStatusFilter').value='responded';request=ctx.loadTickets('',true);assert.match(pending[0].url,/status=responded/);pending.shift().resolve({tickets:[{id:'answered',updated_at:'2026-10-01',status:'responded'}]});await request;assert.equal(rendered.length,1);
 request=ctx.loadTickets();state.token='other-admin';pending.shift().resolve({tickets:[{id:'private',updated_at:'2026-10-09',status:'responded'}]});await request;assert.equal(rendered[0].id,'answered','old session history must be ignored');
 const providerSource=fs.readFileSync(path.join(__dirname,'../provider.js'),'utf8');
 const provider={token:'provider',provider:{},conversations:[]};let providerError='';pending=[];
 const portal=vm.createContext({state:provider,$,setMessage:(text)=>{providerError=text;},renderConversations(){},api:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))});
 vm.runInContext(providerSource.slice(providerSource.indexOf('  let conversationsGeneration = 0;'),providerSource.indexOf('  function renderConversations()')),portal);
 request=portal.loadConversations();await portal.loadConversations();assert.equal(pending.length,1);pending.shift().resolve({items:[{id:'booking-chat',last_message_at:'2026-10-07'}],next_cursor:'older'});await request;
 request=portal.loadConversations('older');assert.match(pending[0].url,/cursor=older/);pending.shift().resolve({items:[{id:'old-chat',last_message_at:'2026-01-01'}]});await request;assert.equal(provider.conversations.length,2);
 request=portal.loadConversations();pending.shift().reject(new Error('Offline'));await request;assert.equal(provider.conversations.length,2);assert.equal(providerError,'Offline');
 request=portal.loadConversations();provider.token='other-provider';pending.shift().resolve({items:[{id:'private',last_message_at:'2026-10-08'}]});await request;assert.equal(provider.conversations.length,2);
 console.log('Admin support passed: filters, earlier tickets, retained refresh history, coalesced reads, visible errors and session isolation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
