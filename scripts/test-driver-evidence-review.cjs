const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('provider-admin.js','utf8');
const start=source.indexOf('  async function loadProviderDocuments('),end=source.indexOf('  async function moderateProvider(',start);
let html='',checkbox={checked:false},requests=[],feedback=[],prompts=0;
const cell={set innerHTML(value){html=value;},querySelectorAll:()=>[]};
const scope={document:{querySelector:()=>checkbox},$:()=>({querySelector:()=>cell,classList:{remove(){}}}),escapeHtml:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'),prompt:()=>{prompts++;return 'Reviewed';},providerFeedback:(...values)=>feedback.push(values),request:async(url,options)=>{requests.push({url,options});return {driver_name:'<private-name>',items:[{id:'doc',document_type:'drivers_license',document_url:'https://example.test/private',status:'pending',expires_on:'2027-02-01'}]};}};
vm.createContext(scope);vm.runInContext(source.slice(start,end),scope);
(async()=>{
 await scope.loadProviderDocuments('provider');assert.match(html,/Expiry entered by applicant: 2027-02-01/);assert.match(html,/data-driver-evidence="doc"/);assert.match(html,/&lt;private-name&gt;/);assert.ok(!html.includes('<private-name>'));
 await scope.reviewDocument('provider','doc','approved');assert.equal(requests.length,1,'unconfirmed evidence must not be approved');assert.equal(prompts,0);assert.equal(feedback.length,1);
 checkbox.checked=true;await scope.reviewDocument('provider','doc','approved');assert.equal(requests[1].options.body.evidence_confirmed,true);assert.equal(requests[1].options.body.status,'approved');
 checkbox.checked=false;await scope.reviewDocument('provider','doc','rejected');assert.equal(requests.at(-2).options.body.status,'rejected','reviewer can reject incorrect dates without approving evidence');
 console.log('Driver evidence admin review passed: escaped owner/expiry display, explicit confirmation, API flag and rejection path.');
})().catch(error=>{console.error(error);process.exitCode=1;});
