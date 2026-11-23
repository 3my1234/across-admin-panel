const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Retired portal: notice page only, and the old service worker removes itself.
const html=fs.readFileSync('provider.html','utf8');
assert.ok(html.includes('ATL Xpres app'));assert.ok(!/<script[^>]+src=/i.test(html),'notice page loads no portal scripts');assert.ok(html.includes('noindex'));
let deleted=[],unregistered=0,navigated=[],handlers={};
const self={addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting(){},registration:{unregister:async()=>{unregistered++;return true;}},clients:{matchAll:async()=>[{url:'https://admin.example/provider.html',navigate:url=>navigated.push(url)}]}};
const caches={keys:async()=>['provider-shell-v9','provider-assets'],delete:async key=>{deleted.push(key);return true;}};
vm.runInNewContext(fs.readFileSync('provider-sw.js','utf8'),{self,caches,Promise});
(async()=>{
 let pending;handlers.activate({waitUntil:p=>pending=p});await pending;
 assert.deepEqual(deleted,['provider-shell-v9','provider-assets']);assert.equal(unregistered,1);assert.deepEqual(navigated,['https://admin.example/provider.html']);
 for(const gone of ['provider.js','provider.css','provider.webmanifest','provider-pwa.js','Dockerfile.provider'])assert.ok(!fs.existsSync(gone),gone+' still published');
 const admin=fs.readFileSync('index.html','utf8');for(const kept of ['provider-admin.js','provider-tier-benefits.js','provider-identity.js'])assert.ok(admin.includes(kept)&&fs.existsSync(kept),'admin still needs '+kept);
 console.log('Provider portal retired: notice page only, cached portal removed from installed browsers, admin assets intact.');
})().catch(error=>{console.error(error);process.exitCode=1;});
