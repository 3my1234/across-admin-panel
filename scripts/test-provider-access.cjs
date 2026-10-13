const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('provider-admin.js','utf8');let status='';const g={setText:(id,text)=>status=text};vm.createContext(g);
vm.runInContext(source.slice(source.indexOf('  function renderProviderAccess('),source.indexOf('  async function loadProviderAccess(')),g);g.renderProviderAccess();
assert.match(status,/one listing total across all categories/);assert.match(status,/document approval/);
assert.doesNotMatch(source,/async function saveProviderAccess/);
assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/id="providerAccessMode"|id="providerPaidStartAt"/);
assert.match(fs.readFileSync('provider.js','utf8'),/Permanent free tier/);
console.log('Permanent Free access passed: one combined listing, document verification, no launch toggles.');
