/* Subscription-funded promotions use existing listings and the same account. */
(function(root){
 'use strict';
 function create({element,request,getActor}) {
  if(!element)return {activate(){},reset(){}};
  let generation=0,busy=false,model=null;
  const node=(tag,text)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;return result;};
  const button=(label,action)=>{const result=node('button',label);result.type='button';result.disabled=busy;result.onclick=action;return result;};
  function render(error='') {
   element.replaceChildren();element.append(node('h2','Promotions and performance'),node('p','Eligible published listings enter promotions automatically while your paid subscription is active. Relevance and fair rotation apply. No additional advertising fee or guaranteed views.'));
   if(error){const warning=node('p',error);warning.style.color='#C62828';warning.setAttribute('role','alert');element.append(warning);}
   element.append(button('Refresh performance',()=>void activate()));
   if(!model)return;
   const toggle=(label,value,save)=>{const line=node('label'),input=node('input');input.type='checkbox';input.checked=value;input.disabled=busy;input.onchange=()=>update(save(input.checked));line.append(input,document.createTextNode(' '+label));return line;};
   element.append(toggle('Include my eligible listings in promotions',model.enabled,enabled=>({enabled})),node('h3','Last 30 days · Promoted placements'));
   for(const [key,label]of [['impressions','Viewable impressions'],['clicks','Listing clicks'],['detail_opens','Details opened'],['contact_taps','Contact taps']])element.append(node('p',label+': '+Number(model.metrics?.[key]||0).toLocaleString()));
   element.append(node('p','Contact taps are not confirmed chats or sales. Counts may undercount offline/blocked analytics and can include your own testing.'),node('h3','Listing preferences'));
   for(const item of model.items||[]) {
    const row=node('section');row.className='verification-box';row.append(node('h4',item.title),toggle('Allow promotion',item.enabled,enabled=>({kind:item.kind,listing_id:item.id,enabled,priority:item.priority})));
    const select=node('select');select.disabled=busy;select.setAttribute('aria-label','Promotion priority for '+item.title);
    for(const [value,label]of [[1,'Normal'],[2,'Prefer'],[3,'Prioritize']]){const option=node('option',label);option.value=String(value);option.selected=item.priority===value;select.append(option);}
    select.onchange=()=>update({kind:item.kind,listing_id:item.id,enabled:item.enabled,priority:Number(select.value)});row.append(select);element.append(row);
   }
  }
  async function activate(){if(busy||!getActor())return;const version=++generation,actor=getActor();try{const data=await request('/providers/me/discovery');if(version!==generation||actor!==getActor())return;model=data;render();}catch(error){if(version===generation&&actor===getActor())render(error.message||'Could not load promotions.');}}
  async function update(payload){if(busy)return;const actor=getActor(),version=generation;busy=true;render();try{await request('/providers/me/discovery',{method:'PUT',body:JSON.stringify(payload)});if(version===generation&&actor===getActor()){busy=false;await activate();}}catch(error){busy=false;if(version===generation&&actor===getActor())render((error.message||'Could not save.')+' Refresh to confirm the current setting before retrying.');}finally{busy=false;}}
  return {activate,reset(){generation++;model=null;busy=false;element.replaceChildren();}};
 }
 root.ProviderPromotions={create};
})(typeof window==='undefined'?globalThis:window);
