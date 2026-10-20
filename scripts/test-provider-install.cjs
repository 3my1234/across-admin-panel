const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function boot({standalone=false,embedded=false,userAgent='Android SamsungBrowser'}={}){
 const events={},nodes=[];let prompted=0;
 const node=()=>({hidden:false,open:false,disabled:false,children:[],listeners:{},classes:new Set(),classList:{toggle(name,on){on?this.owner.classes.add(name):this.owner.classes.delete(name);}},setAttribute(){},append(...items){this.children.push(...items);},showModal(){this.open=true;},close(){this.open=false;},addEventListener(name,fn){this.listeners[name]=fn;}});
 const create=()=>{const n=node();n.classList.owner=n;nodes.push(n);return n;};
 const entry=create(),legacy=create(),button=create();
 const display={matches:standalone,addEventListener:(name,fn)=>events.display=fn};
 const context={navigator:{userAgent},document:{getElementById:id=>id==='providerInstallEntry'?entry:legacy,querySelectorAll:()=>[button],createElement:create,body:{append(){}}},matchMedia:()=>display,ProviderNativeBridge:{embedded:()=>embedded},addEventListener:(name,fn)=>events[name]=fn};context.window=context;
 vm.runInNewContext(fs.readFileSync('provider-install.js','utf8'),context);
 return {entry,legacy,button,events,display,guide:nodes.find(n=>n.className==='provider-install-dialog'),prompt:()=>{events.beforeinstallprompt({preventDefault(){},prompt:async()=>{prompted++;},userChoice:Promise.resolve({outcome:'dismissed'})});},prompted:()=>prompted};
}
(async()=>{
 const t=boot();assert.equal(t.entry.hidden,false,'installation is visible without an account or token');
 await t.button.listeners.click();assert.equal(t.guide.open,true);assert.match(t.guide.children[1].textContent,/Samsung Internet/);t.guide.children[2].listeners.click();assert.equal(t.guide.open,false);
 t.prompt();await Promise.all([t.button.listeners.click(),t.button.listeners.click()]);assert.equal(t.prompted(),1,'only one install prompt can be consumed');assert.equal(t.button.disabled,false);assert.equal(t.entry.hidden,false,'dismissing OS install does not remove the visible entry');
 t.events.appinstalled();assert.equal(t.entry.hidden,true);assert.ok(t.legacy.classes.has('hidden'));
 const installed=boot({standalone:true});assert.equal(installed.entry.hidden,true);installed.display.matches=false;installed.events.display();assert.equal(installed.entry.hidden,false);
 assert.equal(boot({embedded:true}).entry.hidden,true,'embedded native workspace does not offer another installation');
 const ios=boot({userAgent:'iPhone'});await ios.button.listeners.click();assert.match(ios.guide.children[1].textContent,/Share menu/);
 console.log('Provider installation passed: pre-login access, browser fallback, single-use prompt, dismissal, installed/embedded state and iOS instructions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
