const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function main(){
 const source=fs.readFileSync('provider-admin.js','utf8'),button={disabled:false};let captured;
 const ctx=vm.createContext({Number,document:{querySelector:selector=>selector.includes('data-new-price')?{value:'1000'}:selector.includes('data-link-plan')?{value:'171539'}:button},
 confirm:message=>{assert.match(message,/171539/);return true;},setText(){},loadProviderPlans:async()=>{},request:async(url,options)=>{captured={url,options};return{flutterwave_plan_id:171539};}});
 vm.runInContext(source.slice(source.indexOf('  async function changeProviderPlanPrice('),source.indexOf('  async function deactivateProviderPlan(')),ctx);
 await ctx.changeProviderPlanPrice('growth');assert.equal(captured.options.body.flutterwave_plan_id,171539);assert.equal(captured.options.body.amount_ngn,1000);assert.equal(button.disabled,false);
 const browserSource=fs.readFileSync('theme.js','utf8'),handlers={},viewportHandlers={};let revealed=0,height='',offset='';
 const field={matches:()=>true,getBoundingClientRect:()=>({top:500,bottom:560}),scrollIntoView:options=>{assert.equal(options.block,'center');revealed++;}};
 const browser=vm.createContext({window:{innerHeight:800,visualViewport:{height:400,offsetTop:0,addEventListener:(name,fn)=>{viewportHandlers[name]=fn;}},addEventListener(){}},document:{activeElement:field,documentElement:{style:{setProperty:(key,value)=>{if(key==='--visible-viewport-height')height=value;else offset=value;}}},addEventListener:(name,fn)=>{handlers[name]=fn;}},setTimeout:fn=>{fn();return 1;},clearTimeout(){}});
 vm.runInContext(browserSource.slice(browserSource.indexOf('// Shared by admin')),browser);
 viewportHandlers.scroll();assert.equal(revealed,0,'manual viewport scrolling must not pull users back to the focused input');
 viewportHandlers.resize();assert.equal(height,'400px');assert.equal(revealed,1);handlers.focusin();assert.equal(revealed,2);
 field.closest=()=>({});browser.window.visualViewport.offsetTop=36;viewportHandlers.resize();handlers.focusin();assert.equal(revealed,2,'chat composer must never be centred above keyboard');assert.equal(offset,'36px');
 browser.window.visualViewport.height=310;viewportHandlers.resize();assert.equal(height,'310px');assert.equal(revealed,2,'repeated keyboard resizing must not scroll the composer');
 const html=fs.readFileSync('index.html','utf8');
 assert.equal((html.match(/id="providerPlanForm"/g)||[]).length,1);
 assert.ok(html.indexOf('id="providerPlansTable"')<html.indexOf('id="providerPlanForm"'),'existing tier controls come before the optional new-tier form');
 assert.match(html,/<details class="panel">\s*<summary><strong>Create a new subscription tier/);
 console.log('Existing Flutterwave plan linking, optional new-tier form and web keyboard/scroll regressions passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
