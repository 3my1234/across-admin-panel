const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'provider.js'), 'utf8');
function section(from, to) { return source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))); }
async function main() {
  let calls = 0;
  const ctx = vm.createContext({state:{token:'provider'}, FormData, AbortController, setTimeout, clearTimeout, Error, TypeError,
    API:'https://example.test', fetch:async()=>{calls++;throw new TypeError('network');}, signOut:()=>{}});
  vm.runInContext(section('  async function api(', '  async function login('), ctx);
  await assert.rejects(ctx.api('/providers/me/payout-account', {method:'POST'}), /check before trying again/i);
  assert.equal(calls, 1, 'an ambiguous bank mutation must never be retried automatically');
  calls = 0;
  await assert.rejects(ctx.api('/providers/me'), /previously loaded information/i);
  assert.equal(calls, 2);
  ctx.fetch = async()=>({status:409,ok:false,text:async()=>JSON.stringify({message:'Flutterwave already has this bank account registered.'})});
  await assert.rejects(ctx.api('/providers/me/payout-account', {method:'POST'}), error=>error.status===409 && /already has/.test(error.message));
  const messages=[]; const button={disabled:false}; const form={querySelector:()=>button,reset:()=>{}};
  const payout = vm.createContext({state:{provider:{id:'provider'}},confirm:()=>true,FormData:class { *[Symbol.iterator](){yield ['country_code','ng'];} },
    api:async(path)=>{if(path==='/providers/me')throw new Error('refresh failed'); return {status:'active',bank_name:'Test Bank'};},
    setMessage:(text,ok)=>messages.push({text,ok}),renderOverview:()=>{}});
  vm.runInContext(section('  async function configurePayoutAccount(', '  async function loadPlans('), payout);
  await payout.configurePayoutAccount({preventDefault(){},currentTarget:form});
  assert.equal(payout.state.provider.payout_account.status, 'active');
  assert.equal(messages.at(-1).ok, true);
  assert.match(messages.at(-1).text, /connected successfully/);
  assert.equal(button.disabled, false);
  let sends=0, release;
  const resendButton={disabled:false};
  const resend=vm.createContext({$:()=>resendButton,document:{querySelector:()=>({value:'provider@example.test'})},
    api:()=>{sends++;return new Promise(resolve=>release=resolve);},setMessage:()=>{}});
  vm.runInContext(section('  async function resendVerification(', '  function signOut('), resend);
  const pending=resend.resendVerification();await resend.resendVerification();assert.equal(sends,1);
  release({message:'queued'});await pending;assert.equal(resendButton.disabled,false);
  console.log('Provider account errors passed: HTTP errors, ambiguous saves, saved account refresh, resend guard.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
