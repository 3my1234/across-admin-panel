const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.20260927.js','utf8');
let pending=[],rendered=[],error='';const elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',classList:{add(){},remove(){}},prepend(){}});return elements.get(id)};
const state={activeTab:'support',token:'admin',supportTickets:[{id:'ticket',unread_count:2}]};
const g={state,$,currentTicketId:null,ticketHistory:[],ticketCursor:'',ticketRequestSequence:0,document:{hidden:false},setText:(id,text)=>error=text,escapeHtml:x=>x,format:x=>x,renderTicketsTable:rows=>rendered=rows,request:(url,options)=>new Promise((resolve,reject)=>pending.push({url,options,resolve,reject}))};
vm.createContext(g);vm.runInContext(source.slice(source.indexOf('async function openTicketView('),source.indexOf('async function sendTicketReply(')),g);
(async()=>{
 const first=g.openTicketView('ticket','Support');pending.shift().resolve({messages:[{id:'reply',sender_type:'user',message:'Question',created_at:'2026-10-11'}]});await new Promise(r=>setImmediate(r));
 assert.equal(state.supportTickets[0].unread_count,2);assert.match(pending[0].url,/ticket\/read$/);assert.equal(pending[0].options.body.message_id,'reply');pending.shift().resolve({unread_count:1});await first;assert.equal(rendered[0].unread_count,1,'later reply remains unread');
 const failed=g.openTicketView('ticket','Support');pending.shift().reject(Error('offline'));await failed;assert.equal(state.supportTickets[0].unread_count,1);assert.equal(pending.length,0,'failed load must not acknowledge');
 g.document.hidden=true;const hidden=g.openTicketView('ticket','Support');pending.shift().resolve({messages:[{id:'later',sender_type:'user',message:'Later',created_at:'2026-10-12'}]});await hidden;assert.equal(pending.length,0,'hidden browser must not acknowledge');
 assert.match(fs.readFileSync('provider.js','utf8'),/conversationDialog.*addEventListener\("close"/);
 console.log('Portal unread passed: server acknowledgement, later arrivals, failed loads and hidden tabs.');
})().catch(e=>{console.error(e);process.exitCode=1});
