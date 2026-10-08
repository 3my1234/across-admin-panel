const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../provider.js'),'utf8');
async function main(){
 let reset=0,uploads=0,attempt=0,ids=[],saved=[];const file={name:'screenshot.png',type:'image/png',size:100,lastModified:1};
 const button={},imageInput={files:[file]},form={elements:{message:{value:''}},querySelector:()=>button,reset:()=>{reset++;}};
 const state={token:'seller',currentConversation:{id:'thread',subscription_active:true}};
 const g={state,$:()=>imageInput,crypto:{randomUUID:()=>`ref-${ids.length+1}`},Array,Map,JSON,
  PortalStorageUpload:{upload:async()=>{uploads++;}},setMessage:()=>{},conversationItems:[],
  api:async(url,options)=>{if(url.endsWith('/presign'))return {upload_url:'signed',key:'private/photo'};const body=JSON.parse(options.body);ids.push(body.client_message_id);saved.push(body);if(++attempt===1)throw new Error('response lost');return {id:'message',body:'Photo'};},
  loadConversations:async()=>{throw new Error('refresh failed');},openConversation:async()=>{}};
 const ctx=vm.createContext(g);vm.runInContext(source.slice(source.indexOf('  let conversationReplyBusy'),source.indexOf('\n  function renderProviderTools')),ctx);
 await ctx.sendConversationReply({preventDefault:()=>{},currentTarget:form});assert.equal(reset,0);assert.equal(uploads,1);
 await ctx.sendConversationReply({preventDefault:()=>{},currentTarget:form});assert.equal(reset,1,'a saved message must clear even if refresh fails');assert.equal(uploads,1,'retry must reuse uploaded photo');assert.equal(ids[0],ids[1]);assert.equal(saved[1].media_keys[0],'private/photo');
 // An account change during upload must not send old media as the new seller.
 state.token='new-seller';g.api=async(url)=>{if(url.endsWith('/presign'))return {upload_url:'signed',key:'new/private'};throw new Error('must not send old account message');};
 g.PortalStorageUpload.upload=async()=>{state.token='another-seller';};await ctx.sendConversationReply({preventDefault:()=>{},currentTarget:form});assert.equal(reset,1);

 console.log('Provider product chat passed: image-only replies, retained uploads, idempotent retries, post-send refresh failure and account isolation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
