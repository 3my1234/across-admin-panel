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
  $("xpWithdrawalEmpty")?.classList.add("hidden");
  try {
   const data=await request("/api/v1/admin/xp/withdrawals");
   if(requestId!==generation||token!==state.token)return;
   const list=$("xpWithdrawalList");list.replaceChildren();
   for(const item of data.items||[]){
    const card=document.createElement("article");card.className="card xp-withdrawal-card";
    const heading=document.createElement("div");heading.className="withdrawal-card-heading";
    const title=document.createElement("h3");title.textContent=`NGN ${Number(item.points).toLocaleString()}`;
    const badge=document.createElement("span");badge.className="status-pill";badge.dataset.status=item.status;badge.textContent=item.status;heading.append(title,badge);card.append(heading);
    const details=document.createElement("dl");details.className="withdrawal-details";
    for(const [label,text] of [["Customer",item.email],["Bank account",`${item.bank_name} · ${item.account_number}`],["Account name",item.account_name],["Requested",new Date(item.created_at).toLocaleString()],["Review note",item.admin_note],["Transfer reference",item.payout_reference]]){
     if(!text)continue;const group=document.createElement("div"),term=document.createElement("dt"),value=document.createElement("dd");term.textContent=label;value.textContent=text;group.append(term,value);details.append(group);
    }card.append(details);
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
   $("xpWithdrawalStatus").textContent=data.items?.length?`${data.items.length} most recent requests`:"";
   $("xpWithdrawalEmpty")?.classList.toggle("hidden",Boolean(data.items?.length));
  }catch(error){if(token===state.token)$("xpWithdrawalStatus").textContent=error.message;}
 }
 $("xpWithdrawalRefresh").onclick=()=>void loadWithdrawals();
})();
