(() => {
 const oldAllowed=allowedTabsForRole;
 allowedTabsForRole=(role=state.role)=>role==="super_admin"?[...oldAllowed(role),"waitlist"]:oldAllowed(role);
 const oldLoad=loadTabData;
 loadTabData=(tab,options={})=>tab==="waitlist"?loadWaitlist():oldLoad(tab,options);
 async function loadWaitlist(){
  const token=state.token;$("waitlistStatus").textContent="Loading signups...";
  try{const data=await request("/api/v1/admin/waitlist");if(token!==state.token)return;
   $("waitlistStatus").textContent=`${data.total} people on the waitlist. Showing the latest ${data.items.length}. Export CSV for the complete list.`;
   const rows=$("waitlistRows");rows.replaceChildren();
   for(const item of data.items){const row=document.createElement("tr");for(const value of [item.email,item.name||"—",item.phone||"—",item.interest,item.source,new Date(item.created_at).toLocaleDateString()]){const cell=document.createElement("td");cell.textContent=value;row.append(cell);}rows.append(row);}
  }catch(error){if(token===state.token)$("waitlistStatus").textContent=error.message;}
 }
 $("waitlistRefresh").onclick=()=>void loadWaitlist();
 $("waitlistExport").onclick=async()=>{
  const button=$("waitlistExport"),token=state.token;button.disabled=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{const response=await fetch(`${state.apiUrl}/api/v1/admin/waitlist/export`,{signal:controller.signal,headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
   if(!response.ok)throw new Error("Could not export waitlist");const blob=await response.blob();if(token!==state.token)return;
   const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="atlantic-express-waitlist.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){if(token===state.token)$("waitlistStatus").textContent=error.name==="AbortError"?"Export timed out. Please retry.":error.message;}
  finally{clearTimeout(timer);button.disabled=false;}
 };
})();
