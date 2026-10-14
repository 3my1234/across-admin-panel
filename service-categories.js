(function(root){
 'use strict';
 const groups=root.AtlServiceCategories||[], entries=groups.flatMap(group=>group.services.map(name=>({name,group:group.name})));
 function mount(form){
  const input=form?.elements.category;if(!input)return;
  input.placeholder='Search your service, e.g. event staffing';input.setAttribute('list','atl-service-categories');
  const list=document.createElement('datalist');list.id='atl-service-categories';input.after(list);
  const label=document.createElement('label');label.textContent='Service group';const select=document.createElement('select');select.innerHTML='<option value="">All service groups</option>';
  for(const group of groups){const option=document.createElement('option');option.value=group.name;option.textContent=group.name;select.append(option);}label.append(select);input.closest('label').before(label);
  function suggest(){const query=input.value.trim().toLowerCase();list.replaceChildren();const matches=entries.filter(entry=>(!select.value||entry.group===select.value)&&(!query||(entry.name+' '+entry.group).toLowerCase().includes(query))).slice(0,50);for(const entry of matches){const option=document.createElement('option');option.value=entry.name;option.label=entry.group;list.append(option);}}
  select.onchange=suggest;input.addEventListener('input',suggest);
  input.addEventListener('change',()=>{if(!entries.some(e=>e.name===input.value))return;const types={'Car rental':'car_rental','Car washing':'car_wash','Mobile car washing':'car_wash','Auto mechanic services':'mechanic','Plumbing':'plumber','Carpentry':'carpenter'};form.elements.listing_type.value=types[input.value]||'artisan';form.elements.listing_type.dispatchEvent(new Event('change'));});
  suggest();
 }
 root.ServiceCategoryPicker={mount};
})(globalThis);
