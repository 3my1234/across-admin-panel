const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../provider.js"),"utf8");
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
async function main(){
const nodes={plans:{innerHTML:""},subscriptionGuidance:{innerHTML:""}},buttons=[{dataset:{subscribe:"basic",method:"card"}},{dataset:{subscribe:"basic",method:"banktransfer"}}],requests=[];
const state={provider:{verification_status:"approved",subscription:{}},plans:[{id:"basic",name:"Basic",amount_ngn:500,listing_limit:10}],transferMonths:[1,3,6,12]};
const g={state,$:id=>nodes[id],hasActiveSubscription:()=>false,hasPendingSubscription:()=>false,clearPendingSubscription:()=>{},renderSubscriptionGates:()=>{},escapeHtml:value=>String(value),money:value=>`NGN ${value}`,document:{querySelectorAll:()=>buttons,querySelector:()=>({value:"6"})},setMessage:()=>{},URL,location:{href:"https://example.test/provider.html"},api:async(url,options)=>{requests.push(JSON.parse(options.body));return {checkout_link:"https://checkout.flutterwave.com/test",tx_ref:"ref"};},savePendingSubscription:()=>{},console};
vm.createContext(g);vm.runInContext(extract('  async function subscribe(', '  function renderSubscriptionGates('),g);
g.renderPlans();for(const total of [500,1500,3000,6000])assert.ok(nodes.plans.innerHTML.includes(`NGN ${total} total`));
await buttons[1].onclick();assert.equal(requests[0].payment_method,"banktransfer");assert.equal(requests[0].duration_months,6);
await buttons[0].onclick();assert.equal(requests[1].payment_method,"card");assert.equal(requests[1].duration_months,1);
state.transferMonths=undefined;g.renderPlans();assert.ok(!nodes.plans.innerHTML.includes('value="3"'),"old backend exposes only one month");
console.log("Subscription periods passed: visible totals, chosen transfer period, monthly cards and old-backend fallback.");
}main().catch(error=>{console.error(error);process.exitCode=1;});
