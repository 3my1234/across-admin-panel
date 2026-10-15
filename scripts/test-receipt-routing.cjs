const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
(async()=>{
 const events={},posted=[];const self={location:{href:'https://provider.example/provider-sw.js'},clients:{matchAll:async()=>[{url:'https://provider.example/provider.html',postMessage:data=>posted.push(data)},{url:'https://other.example/',postMessage:()=>{throw Error('cross-origin receipt routing');}}]},addEventListener:(name,handler)=>(events[name]??=[]).push(handler)};
 vm.runInNewContext(fs.readFileSync('provider-sw.js','utf8'),{self,URL,Set});
 let pending;events.push[0]({data:{json:()=>({conversation_id:'11111111-1111-4111-8111-111111111111',ticket_id:'22222222-2222-4222-8222-222222222222',chat_room_id:'not-a-uuid',body:'PRIVATE MESSAGE',location:{latitude:9,longitude:7}})},waitUntil:value=>pending=value});await pending;
 assert.equal(posted.length,1);assert.equal(posted[0].type,'provider-community-activity');assert.equal(Object.keys(posted[0].routing).sort().join(','),'conversation_id,ticket_id');assert.doesNotMatch(JSON.stringify(posted),/PRIVATE MESSAGE|latitude|longitude|not-a-uuid/);
 console.log('Receipt routing passed: same-origin clients, bounded validated IDs, no private text or coordinates.');
})().catch(error=>{console.error(error);process.exitCode=1;});
