const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
async function main() {
  const admin=fs.readFileSync(path.join(__dirname,'../app.20260927.js'),'utf8');let loggedOut=0;
  const auth=vm.createContext({state:{token:'admin',apiUrl:'https://example.test'},AbortController,setTimeout,clearTimeout,Error,TypeError,
    fetch:async()=>({status:401,ok:false,text:async()=>'{"message":"expired"}'}),logout(){loggedOut++;},setText(){}});
  vm.runInContext(admin.slice(admin.indexOf('async function request('),admin.indexOf('function updateListControls(')),auth);
  await assert.rejects(auth.request('/api/v1/admin/waitlist'),error=>error.status===401);assert.equal(loggedOut,1);
  console.log('Admin session recovery passed: expired admin sessions log out on 401.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
