/* Super-admin reviewed bank payouts. This page records transfers; it never sends money. */
(() => {
 const oldAllowed=allowedTabsForRole;
 allowedTabsForRole=(role=state.role)=>role==="super_admin"?[...oldAllowed(role),"xp-withdrawals"]:oldAllowed(role);
 const oldLoad=loadTabData;
 loadTabData=(tab,options={})=>tab==="xp-withdrawals"?loadWithdrawals():oldLoad(tab,options);
 let generation=0;
 async function loadWithdrawals(){
  const requestId=++generation,token=state.token;
  $("xpWithdrawalStatus").textContent="Loading withdrawal requests...";
  try {
   const data=await request("/api/v1/admin/xp/withdrawals");
   if(requestId!==generation||token!==state.token)return;
   const list=$("xpWithdrawalList");list.replaceChildren();
   for(const item of data.items||[]){
    const card=document.createElement("article");card.className="card";
    const title=document.createElement("h3");title.textContent=`NGN ${Number(item.points).toLocaleString()} · ${item.status}`;card.append(title);
    for(const text of [item.email,`${item.bank_name} · ${item.account_number}`,item.account_name,`Requested ${new Date(item.created_at).toLocaleString()}`,item.admin_note,item.payout_reference]){
     if(!text)continue;const line=document.createElement("p");line.textContent=text;card.append(line);
    }
    if(["pending","processing"].includes(item.status)){
     const form=document.createElement("form");form.className="form-grid";
     const select=document.createElement("select");select.setAttribute("aria-label","Withdrawal action");
     for(const status of item.status==="pending"?["processing","rejected"]:["paid","rejected"]){const option=document.createElement("option");option.value=status;option.textContent=status==="processing"?"Begin review":status==="paid"?"Record completed bank transfer":"Reject and return XP";select.append(option);}
     const reference=document.createElement("input");reference.placeholder="Bank transfer reference (required when paid)";reference.setAttribute("aria-label","Bank transfer reference");reference.maxLength=200;
     const note=document.createElement("textarea");note.placeholder="Note to the customer / reason for rejection";note.setAttribute("aria-label","Review note");note.maxLength=1000;
     const button=document.createElement("button");button.textContent="Save review";button.type="submit";
     const message=document.createElement("p");message.setAttribute("role","status");
     form.append(select,reference,note,button,message);card.append(form);
     form.onsubmit=async event=>{
      event.preventDefault();button.disabled=true;message.textContent="Saving...";
      try{await request(`/api/v1/admin/xp/withdrawals/${item.id}`,{method:"PATCH",body:{status:select.value,payout_reference:reference.value.trim(),note:note.value.trim()}});await loadWithdrawals();}
      catch(error){message.textContent=error.message;button.disabled=false;}
     };
    } list.append(card);
   }
   $("xpWithdrawalStatus").textContent=data.items?.length?`${data.items.length} most recent requests`:"No withdrawal requests yet.";
  }catch(error){if(token===state.token)$("xpWithdrawalStatus").textContent=error.message;}
 }
 $("xpWithdrawalRefresh").onclick=()=>void loadWithdrawals();
})();
