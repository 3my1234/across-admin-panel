const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function main(){
 const messages=[],store=new Map();let starts=0,resumes=0;
 const context={URL,URLSearchParams,location:{href:'https://provider.atlxpres.com/?embedded=1&release=test',search:'?embedded=1'},ReactNativeWebView:{postMessage:value=>messages.push(JSON.parse(value))},localStorage:{setItem:(key,value)=>store.set(key,value)},StorageEvent:class{},dispatchEvent(){},document:{querySelector:()=>null}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('provider-native.js','utf8'),context);
 assert.equal(context.ProviderNativeBridge.attach({start:async token=>{assert.equal(token,'test-session');starts++;},resume:async()=>resumes++}),true);
 assert.deepEqual(messages,[{type:'provider-ready'}]);
 const config={token:'test-session',nonce:'test-nonce',preference:'dark'};
 await context.ATLProviderNativeStart(config);await context.ATLProviderNativeStart(config);
 assert.equal(starts,1);assert.equal(store.get('atl.appearance.v1'),'dark');
 context.ATLProviderNativeResume();assert.equal(resumes,1);
 context.ProviderNativeBridge.signedOut();assert.equal(messages.at(-1).nonce,'test-nonce');
 assert.ok(messages.every(message=>!JSON.stringify(message).includes('test-session')),'session never returned in a bridge message');
 context.location.search='?view=messages';assert.equal(context.ProviderNativeBridge.embedded(),true,'native identity survives local navigation');
 const provider=fs.readFileSync('provider.js','utf8');vm.runInContext(provider.slice(provider.indexOf('  function providerViewURL('),provider.indexOf('  const chatCache=')),context);
 assert.ok(context.providerViewURL('listings').includes('embedded=1'),'reload retains embedded mode');
 console.log('Provider native bridge passed: one shared-account boot, theme, resume, nonce and no session in messages.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
