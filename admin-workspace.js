/* Current marketplace operations. Legacy records remain available in Settings. */
(() => {
  const allowed=()=>['super_admin','catalog_admin'].includes(state.role);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const count=value=>Number.isFinite(Number(value))?Number(value).toLocaleString():'Unavailable';
  let overviewFlight=null, overviewActor='', overviewAt=0, overviewGeneration=0;
  let subscriberGeneration=0,subscriberActor='',subscribers=[],cursor='',hasMore=false,subscriberLoading=false;
  function metric(title,value,detail,symbol){return `<article class="workspace-metric"><span class="workspace-symbol" aria-hidden="true">${symbol}</span><div><span>${title}</span><strong>${count(value)}</strong><small>${detail}</small></div></article>`;}
  function attention(title,value,tab,filter=''){return `<button class="attention-item" data-open-workspace="${tab}" data-workspace-filter="${filter}"><span>${title}</span><strong>${count(value)}</strong><span aria-hidden="true">›</span></button>`;}
  async function overview({force=false}={}) {
    if(state.activeTab!=='overview')return;
    const actor=state.token+':'+state.role;
    if(!allowed()){$('businessOverviewStatus').textContent='This account has limited administrative access. Contact a super admin for marketplace permissions.';for(const id of ['businessOverviewStats','businessAttention','businessSystem'])$(id).replaceChildren();return;}
    if(overviewActor===actor&&overviewFlight)return overviewFlight;
    if(!force&&overviewActor===actor&&Date.now()-overviewAt<15000)return;
    const sameActor=overviewActor===actor;const seq=++overviewGeneration;overviewActor=actor;
    $('businessOverviewStatus').textContent='Loading business overview...';$('reloadBusinessOverview').disabled=true;
    if(!sameActor)for(const id of ['businessOverviewStats','businessAttention','businessSystem'])$(id).replaceChildren();
    overviewFlight=(async()=>{
      const current=()=>seq===overviewGeneration&&actor===state.token+':'+state.role;
      // Render business counts independently of slower operational probes.
      const business=(async()=>{try{
        const d=await request('/api/v1/admin/business-overview',{timeoutMs:8000,retry:false});if(!current())return;
        $('businessOverviewStats').innerHTML=metric('Active accounts',d.active_accounts,'Enabled accounts, including provider owners','♙')+metric('Active providers',d.active_providers,'Free and paid business profiles','⌂')+metric('Paid subscribers',d.paid_providers,'One per active provider with confirmed paid access','✓')+metric('Verified providers',d.verified_providers,'Approved documents and an enabled profile','◇');
        $('businessAttention').innerHTML=attention('Provider verification',d.pending_providers,'providers','pending')+attention('Services awaiting moderation',d.pending_services,'service-moderation','pending')+attention('Products awaiting moderation',d.pending_products,'product-moderation','pending')+attention('Support awaiting a reply',d.open_support,'support','open')+attention('Open chat reports',d.open_reports,'community','open')+attention('Unresolved complaints',d.unresolved_complaints,'complaints')+attention('Paid access expiring within 7 days',d.expiring_providers,'subscriptions','expiring');
        $('businessOverviewStatus').textContent=`Updated ${new Date(d.generated_at).toLocaleString()}. Account counts are not daily active users. Subscription totals exclude Free profiles.`;overviewAt=Date.now();
      }catch(error){if(current())$('businessOverviewStatus').textContent=error.message+' Use Refresh overview to retry.';}})();
      const system=(async()=>{
        const results=await Promise.allSettled([request('/api/v1/ready',{auth:false,timeoutMs:6000,retry:false}),request('/api/v1/admin/ops/queue-health',{timeoutMs:8000,retry:false})]);if(!current())return;
        const ready=results[0],queues=results[1];const root=$('businessSystem');root.replaceChildren();
        const line=(title,text)=>{const article=document.createElement('article');article.className='system-item';const strong=document.createElement('strong');strong.textContent=title;const value=document.createElement('span');value.textContent=text;article.append(strong,value);root.append(article);};
        line('API dependencies',ready.status==='fulfilled'?(ready.value.ok?'Ready at last check':'Needs attention'):'Readiness unavailable; retry refresh');
        if(queues.status==='fulfilled'){
          const q=queues.value;for(const [key,title] of [['email','Email queue'],['push','Mobile push queue'],['web_push','Browser push queue']]){const v=q[key];line(title,v?`${count(v.pending)} waiting · oldest ${Math.max(0,Math.floor(Number(v.oldest_seconds)||0))} seconds`:'Unavailable');}
          const pool=q.database_pool;line('This API database pool',pool?`${count(pool.acquired)} in use / ${count(pool.max)} maximum`:'Unavailable');
        }else line('Notification queues','Queue health unavailable; retry refresh');
      })();
      await Promise.all([business,system]);
    })().finally(()=>{if(seq===overviewGeneration){overviewFlight=null;$('reloadBusinessOverview').disabled=false;}});
    return overviewFlight;
  }
  function renderSubscribers(){
    $('subscribersTable').innerHTML='<thead><tr><th>Provider</th><th>Contact</th><th>Plan</th><th>Verification</th><th>Paid access ends</th><th>Payment mode</th></tr></thead><tbody>'+subscribers.map(s=>`<tr><td><strong>${esc(s.business_name)}</strong></td><td>${esc(s.contact_email)}</td><td>${esc(s.plan_name)}</td><td><span class="status-pill" data-status="${esc(s.verification_status)}">${esc(s.verification_status)}</span></td><td>${esc(new Date(s.ends_at).toLocaleString())}</td><td>${s.billing_mode==='recurring'?'Recurring billing':'Prepaid'} · ${count(s.duration_months)} month(s)</td></tr>`).join('')+(subscribers.length?'':'<tr><td colspan="6">No active paid subscribers match these filters.</td></tr>')+'</tbody>';
    $('moreSubscribersButton').classList.toggle('hidden',!hasMore);$('moreSubscribersButton').disabled=subscriberLoading;
  }
  async function loadSubscribers({reset=true}={}){
    if(!allowed())return;
    const actor=state.token+':'+state.role;
    if(!reset&&(subscriberLoading||!hasMore))return;
    const seq=++subscriberGeneration;
    if(actor!==subscriberActor){subscribers=[];cursor='';hasMore=false;subscriberActor=actor;renderSubscribers();}
    subscriberLoading=true;$('reloadSubscribersButton').disabled=true;$('moreSubscribersButton').disabled=true;
    $('subscriberStatusText').textContent='Loading subscribers...';
    const params=new URLSearchParams({limit:'25',status:$('subscriberStatus').value});const search=$('subscriberSearch').value.trim();if(search)params.set('search',search);if(!reset&&cursor)params.set('cursor',cursor);
    try{
      const data=await request('/api/v1/admin/subscribers?'+params,{timeoutMs:8000,retry:false});if(seq!==subscriberGeneration||actor!==state.token+':'+state.role)return;
      subscribers=reset?(data.items||[]):[...new Map([...subscribers,...(data.items||[])].map(item=>[item.provider_id,item])).values()];cursor=data.next_cursor||'';hasMore=Boolean(data.has_more);
      $('subscriberStatusText').textContent=`${count(subscribers.length)} active subscriber(s) loaded${hasMore?' · more available':''}. Paid access and gateway renewals are separate records.`;
      renderSubscribers();
    }catch(error){if(seq===subscriberGeneration&&actor===state.token+':'+state.role)$('subscriberStatusText').textContent=error.message+' Use Refresh subscribers to retry.';}
    finally{if(seq===subscriberGeneration){subscriberLoading=false;$('reloadSubscribersButton').disabled=false;$('moreSubscribersButton').disabled=false;}}
  }
  window.AtlAdminWorkspace={overview,subscribers:loadSubscribers};
  const originalLoad=loadTabData;
  loadTabData=(tab,options={})=>{
    const billing=$('providerBillingSection');billing.classList.toggle('hidden',state.role!=='super_admin');if(state.role!=='super_admin')billing.open=false;
    if(tab==='subscriptions'){document.body.classList.add('providers-view','operations-view');document.body.dataset.operationsPage=tab;return loadSubscribers({reset:true});}
    return originalLoad(tab,options);
  };
  $('reloadBusinessOverview').onclick=()=>void overview({force:true});
  $('reloadSubscribersButton').onclick=()=>void loadSubscribers();
  $('moreSubscribersButton').onclick=()=>void loadSubscribers({reset:false});
  $('subscriberSearch').oninput=debounce(()=>loadSubscribers(),300);
  $('subscriberStatus').onchange=()=>void loadSubscribers();
  $('providerBillingSection').addEventListener('toggle',()=>{if($('providerBillingSection').open&&state.role==='super_admin')void window.AtlProviderBilling.load();});
  $('businessAttention').onclick=event=>{
    const button=event.target.closest('[data-open-workspace]');if(!button)return;const tab=button.dataset.openWorkspace,filter=button.dataset.workspaceFilter;
    if(!allowedTabsForRole().includes(tab))return;
    const ids={providers:'providerVerificationStatus','service-moderation':'providerListingModerationStatus','product-moderation':'merchantProductStatus',subscriptions:'subscriberStatus',support:'ticketStatusFilter',community:'communityAdminFilter'};
    if(filter&&ids[tab])$(ids[tab]).value=filter;
    setActiveTab(tab);void loadTabData(tab);
  };
})();
