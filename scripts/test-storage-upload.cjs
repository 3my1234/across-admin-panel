const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
// Response parsing is also checked with the browser's real DOMParser in Chrome.
const context = vm.createContext({
  AbortController,
  DOMParser: class { parseFromString(text) { const value=JSON.parse(text); return { querySelector: selector => ({textContent: selector.endsWith("Code") ? value.code : value.requestID}) }; } },
  setTimeout: callback => { context.timeout = callback; return 1; },
  clearTimeout: () => { context.cleared = true; },
  fetch: async (url, options) => { context.options=options; return context.response; }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../storage-upload.js"), "utf8"), context);
const helper=context.PortalStorageUpload;
const signed={upload_url:"https://example.invalid/signed",view_url:"https://example.invalid/image"};
async function main() {
  context.response={ok:true};
  assert.equal(await helper.upload({type:" IMAGE/JPEG "},signed),signed.view_url);
  assert.equal(context.options.headers["Content-Type"],"image/jpeg");
  assert.equal(context.options.credentials,"omit");assert.equal(context.options.referrerPolicy,"no-referrer");
  assert.equal(context.options.headers.Authorization,undefined);assert.equal(context.cleared,true);
  context.response={ok:false,status:403,text:async()=>JSON.stringify({code:"InvalidAccessKeyId",requestID:"ABC123",message:"SECRET"}),headers:{get:()=>null}};
  await assert.rejects(helper.upload({type:"image/jpeg"},signed),error=>error.message.includes("InvalidAccessKeyId")&&error.message.includes("ABC123")&&!error.message.includes("SECRET")&&!error.message.includes(signed.upload_url));
  assert.match(helper.storageError(403,JSON.stringify({code:"AccessDenied",requestID:""})).message,/permission/);
  assert.match(helper.storageError(403,"not XML").message,/Storage rejected/);
  assert.doesNotMatch(helper.storageError(403,JSON.stringify({code:"https://secret.invalid",requestID:"<script>"})).message,/secret|script/);
  context.fetch=async()=>{throw new TypeError("network failure");};
  await assert.rejects(helper.upload({type:"image/jpeg"},signed),/browser could not/);
  context.fetch=async(url,options)=>new Promise((resolve,reject)=>{options.signal.addEventListener("abort",()=>reject(Object.assign(new Error("aborted"),{name:"AbortError"})));});
  const timeout=helper.upload({type:"image/jpeg"},signed);context.timeout();await assert.rejects(timeout,/timed out/);
  console.log("Storage upload regressions passed: signed MIME, no forwarded credentials, revoked-key/permission errors, safe diagnostics, network failure and timeout.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
