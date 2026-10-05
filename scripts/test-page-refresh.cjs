const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","provider.js"),"utf8");
async function main(){
 const pending=[];const state={token:"buyer",provider:{},requests:[],requestCursor:""};
 const controls={requestStatus:{value:""},requestSearch:{value:""}};
 const start=source.indexOf("  let requestsGeneration = 0;");const end=source.indexOf("  async function updateRequest",start);
 const context=vm.createContext({state,PAGE_SIZE:25,URLSearchParams,$:id=>controls[id],api:()=>new Promise(resolve=>pending.push(resolve)),renderRequests:()=>{},renderOverview:()=>{}});
 vm.runInContext(source.slice(start,end),context);
 const old=context.loadRequests({reset:true});const fresh=context.loadRequests({reset:true});
 pending[1]({items:[{id:"latest",status:"completed"}]});await fresh;
 pending[0]({items:[{id:"old",status:"pending"}]});await old;
 assert.equal(state.requests[0].id,"latest","late request must not undo the completed state");
 const prior=context.loadRequests({reset:true});state.token="another-provider";
 pending[2]({items:[{id:"private-old-provider"}]});await prior;
 assert.equal(state.requests[0].id,"latest","old session response must be ignored");
 console.log("Provider page regressions passed: latest response and session isolation.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
