const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function main(){
 const source=fs.readFileSync('provider-admin.js','utf8'),button={disabled:false};let captured;
 const ctx=vm.createContext({Number,document:{querySelector:selector=>selector.includes('data-new-price')?{value:'1000'}:selector.includes('data-link-plan')?{value:'171539'}:button},
 confirm:message=>{assert.match(message,/171539/);return true;},setText(){},loadProviderPlans:async()=>{},request:async(url,options)=>{captured={url,options};return{flutterwave_plan_id:171539};}});
 vm.runInContext(source.slice(source.indexOf('  async function changeProviderPlanPrice('),source.indexOf('  async function deactivateProviderPlan(')),ctx);
 await ctx.changeProviderPlanPrice('growth');assert.equal(captured.options.body.flutterwave_plan_id,171539);assert.equal(captured.options.body.amount_ngn,1000);assert.equal(button.disabled,false);
 const browserSource=fs.readFileSync('theme.js','utf8'),handlers={},viewportHandlers={};let revealed=0,height='';
 const field={matches:()=>true,getBoundingClientRect:()=>({top:500,bottom:560}),scrollIntoView:options=>{assert.equal(options.block,'center');revealed++;}};
 const browser=vm.createContext({window:{innerHeight:800,visualViewport:{height:400,offsetTop:0,addEventListener:(name,fn)=>{viewportHandlers[name]=fn;}},addEventListener(){}},document:{activeElement:field,documentElement:{style:{setProperty:(_key,value)=>{height=value;}}},addEventListener:(name,fn)=>{handlers[name]=fn;}},setTimeout:fn=>{fn();return 1;},clearTimeout(){}});
 vm.runInContext(browserSource.slice(browserSource.indexOf('// Shared by admin')),browser);
 viewportHandlers.resize();assert.equal(height,'400px');assert.equal(revealed,1);handlers.focusin();assert.equal(revealed,2);
 console.log('Existing Flutterwave plan linking and web keyboard viewport regressions passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
