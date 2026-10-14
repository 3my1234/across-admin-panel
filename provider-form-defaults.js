(function(root){
 'use strict';
 function apply(form,account={},provider={}){
  if(!form)return;
  const values={contact_phone:provider.contact_phone||account.phone||'',contact_email:provider.contact_email||account.email||'',contact_name:account.full_name||'',full_name:account.full_name||'',business_name:provider.business_name||account.full_name||''};
  for(const [name,value] of Object.entries(values)){const field=form.elements[name];if(field&&!field.value.trim()&&value)field.value=value;}
 }
 const api={apply};if(typeof module!=='undefined')module.exports=api;else root.ProviderFormDefaults=api;
})(globalThis);
