const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('provider.js','utf8');
const body=source.slice(source.indexOf('async function postVideos(kind)'),source.indexOf('async function loadPlans()',source.indexOf('async function postVideos(kind)')));
async function scenario(files,retained,policy){
 const calls=[];const context={state:{postPolicy:policy,productRetainedVideos:retained},$:()=>({files}),setMessage(){},PortalStorageUpload:{async upload(file,signed){calls.push({upload:file.size})}},api:async(path,options)=>{calls.push({path,payload:JSON.parse(options.body)});return path.endsWith('/complete')?{url:'https://api.test/new-video'}:{key:'synthetic-ticket'};}};
 vm.createContext(context);vm.runInContext(body+';this.invoke=postVideos;',context);
 return {calls,run:()=>context.invoke('product')};
}
(async()=>{
 let s=await scenario([],['saved-1','saved-2'],{max_videos:0});assert.deepEqual(Array.from(await s.run()),['saved-1','saved-2']);assert.equal(s.calls.length,0);
 s=await scenario([{type:'video/mp4',size:100,name:'test.mp4'}],[],{max_videos:0});await assert.rejects(s.run(),/Gold/);assert.equal(s.calls.length,0);
 s=await scenario([{type:'video/mp4',size:100,name:'test.mp4'}],[],{max_videos:1});assert.equal((await s.run())[0],'https://api.test/new-video');assert.equal(s.calls[0].payload.file_size,100);
 s=await scenario([{type:'video/mp4',size:100,name:'test.mp4'}],[],{max_videos:1,video_uploads_paused:true});await assert.rejects(s.run(),/paused/);assert.equal(s.calls.length,0);
 console.log('Launch video client: retained media, new tier limit, exact upload size and pause PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
