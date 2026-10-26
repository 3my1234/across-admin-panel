const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('provider.js','utf8');
const extract=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
async function main(){
 let pending={tx_ref:'PROVIDER-owned'},answer=false,result='cancelled',fail=false,notices=[],calls=[],held;
 const state={token:'owner',provider:{subscription:{status:'pending'}}};
 const g={state,window:{confirm:()=>answer},readPendingSubscription:()=>pending,clearPendingSubscription:()=>{pending=null},renderOverview:()=>{},setMessage:m=>notices.push(m),api:async(path,options)=>{calls.push({path,options});if(held)await held;if(fail)throw Error('Status unavailable');return path.endsWith('/cancel')?{payment_state:result}:{subscription:{status:'none'}};}};
 vm.createContext(g);vm.runInContext('let subscriptionFlight=false;'+extract('  async function cancelUnpaidSubscriptionCheckout()', '  let subscriptionFlight=false;'),g);
 await g.cancelUnpaidSubscriptionCheckout();assert.equal(calls.length,0,'needs explicit unpaid confirmation');assert.ok(pending);
 answer=true;fail=true;await g.cancelUnpaidSubscriptionCheckout();assert.ok(pending,'gateway uncertainty keeps recovery marker');
 fail=false;result='pending';await g.cancelUnpaidSubscriptionCheckout();assert.ok(pending,'other pending checkouts stay protected');
 result='cancelled';let release;held=new Promise(resolve=>release=resolve);const before=calls.length;
 const one=g.cancelUnpaidSubscriptionCheckout(),two=g.cancelUnpaidSubscriptionCheckout();release();await Promise.all([one,two]);held=null;
 assert.equal(calls.length,before+2,'one cancellation and one profile refresh only');assert.equal(pending,null);assert.ok(notices.at(-1).includes('preferred payment method'));
 pending={tx_ref:'PROVIDER-paid'};result='settled';await g.cancelUnpaidSubscriptionCheckout();assert.equal(pending,null);assert.ok(notices.at(-1).includes('Payment verified'));
 pending={tx_ref:'PROVIDER-owned'};const previous=state.provider;held=new Promise(resolve=>release=resolve);const stale=g.cancelUnpaidSubscriptionCheckout();state.token='other';release();await stale;held=null;assert.equal(state.provider,previous,'stale owner response cannot update next account');assert.ok(pending);
 // A cancelled/failed URL is untrusted. It must not unlock checkout locally.
 let clears=0,checks=0;
 Object.assign(g,{URLSearchParams,location:{search:'?subscription_return=1&status=cancelled&tx_ref=PROVIDER-owned'},hasActiveSubscription:()=>false,clearPendingSubscription:()=>{clears++},openSubscription:()=>{},savePendingSubscription:()=>{},delay:async()=>{},confirmPendingSubscription:async()=>{checks++;return 'pending'},clearSubscriptionReturn:()=>{}});
 vm.runInContext(extract('  async function handleSubscriptionReturn()', '  async function refreshSubscriptionStatus()'),g);await g.handleSubscriptionReturn();assert.ok(checks>0);assert.equal(clears,0,'browser cancellation is not authoritative');
 console.log('Subscription recovery passed: consent, gateway uncertainty, duplicate taps, transfer retry guidance, completed payment, stale account and untrusted return URL.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
