const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.20260927.js'),'utf8');
async function main(){
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'all',disabled:false,textContent:'',classList:{toggle(){},add(){},remove(){}},addEventListener(){}});return elements.get(id);};
 const state={token:'admin',supportTickets:[]};let pending=[],rendered=[];
 const ctx=vm.createContext({PortalChatHistory:{create:()=>({get:()=>null,put:()=>{},clear:()=>{}})},state,$,setText:(id,text)=>{$(id).textContent=text;},renderTicketsTable:rows=>{rendered=rows;},sendTicketReply(){},request:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))});
 vm.runInContext(source.slice(source.indexOf('let currentTicketId = null;'),source.indexOf('function renderTicketsTable(')),ctx);
 let request=ctx.loadTickets();const coalesced=ctx.loadTickets();await coalesced;assert.equal(pending.length,1);
 pending.shift().resolve({tickets:[{id:'latest',updated_at:'2026-10-07',status:'open'}],next_cursor:'page2'});await request;
 request=ctx.loadTickets('page2');assert.match(pending[0].url,/cursor=page2/);pending.shift().resolve({tickets:[{id:'older-answered',updated_at:'2026-10-01',status:'responded'}]});await request;assert.equal(rendered.length,2);
 request=ctx.loadTickets();pending.shift().resolve({tickets:[{id:'latest',updated_at:'2026-10-08',status:'open'}],next_cursor:'page2'});await request;assert.equal(rendered.length,2,'background refresh must retain loaded earlier tickets');
 request=ctx.loadTickets();pending.shift().reject(new Error('Offline'));await request;assert.equal(rendered.length,2);assert.equal($('ticketListStatus').textContent,'Offline','list errors must be visible outside the closed thread panel');
 $('ticketStatusFilter').value='responded';request=ctx.loadTickets('',true);assert.match(pending[0].url,/status=responded/);pending.shift().resolve({tickets:[{id:'answered',updated_at:'2026-10-01',status:'responded'}]});await request;assert.equal(rendered.length,1);
 request=ctx.loadTickets();state.token='other-admin';pending.shift().resolve({tickets:[{id:'private',updated_at:'2026-10-09',status:'responded'}]});await request;assert.equal(rendered[0].id,'answered','old session history must be ignored');
 console.log('Admin support passed: filters, earlier tickets, retained refresh history, coalesced reads, visible errors and session isolation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
