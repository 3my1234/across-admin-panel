/* Aggregate host history; role checks are also enforced by the API. */
(() => {
  const host=document.querySelector('[data-panel="overview"]'); if(!host)return;
  const panel=document.createElement('section');panel.className='panel';panel.hidden=true;
  const title=document.createElement('h2');title.textContent='Server capacity';
  const status=document.createElement('p');status.setAttribute('role','status');
  const controls=document.createElement('div');controls.style.cssText='display:flex;gap:12px;flex-wrap:wrap;align-items:center';
  const range=document.createElement('select');range.setAttribute('aria-label','Capacity history range');
  for(const [value,label] of [[1,'Last hour'],[6,'Last 6 hours'],[24,'Last day'],[168,'Last 7 days']]){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value===6;range.append(option);}
  const refresh=document.createElement('button');refresh.textContent='Refresh capacity';refresh.className='secondary-button';
  const download=document.createElement('button');download.textContent='Download measurements';download.className='secondary-button';download.disabled=true;
  const content=document.createElement('div');content.style.cssText='display:grid;gap:16px';
  const note=document.createElement('p');note.className='muted';note.textContent='One-minute samples, seven-day retention. First samples establish a baseline. Latency is a histogram upper bound per API instance, not an average across servers. Host network usage is not S3/CDN billing. These are measurements, not a verified user-capacity limit.';
  controls.append(range,refresh,download);panel.append(title,controls,status,content,note);host.append(panel);
  let flight=false,epoch=0,latest=null,actor='';
  const format=value=>value==null?'Unavailable':typeof value==='number'?value.toLocaleString(undefined,{maximumFractionDigits:2}):String(value);
  const line=(parent,label,value)=>{const row=document.createElement('p');row.style.margin='6px 0';const name=document.createElement('strong');name.textContent=label+': ';row.append(name,document.createTextNode(format(value)));parent.append(row);};
  const advice={container_cpu_limit:'A container is hitting its CPU cap. Compare endpoint latency and host headroom before raising its limit or adding replicas.',container_memory_limit:'A container is close to its memory cap. Inspect growth and its limit before increasing host RAM.',host_cpu:'Find the container consuming CPU; separate media work or add API capacity only if PostgreSQL has headroom.',host_memory:'Inspect container memory growth and OOM events before increasing RAM.',host_disk:'Review retained images, logs and media; preserve database backups before reclaiming storage.',database_locks:'Inspect the blocking transaction, especially Town Hall rooms. More API replicas will not fix a lock.',database_connections:'Review the total connection budget across all replicas and workers; do not increase pools blindly.',email_queue:'Check delivery failures, SMTP limits and worker health before increasing email workers.',push_queue:'Check push failures and worker throughput.',media_queue:'Inspect media worker CPU/throttling and job failures; isolate or expand processing capacity.',api_errors:'Inspect feature errors and failed dependencies.',api_latency:'Compare endpoint latency with CPU, pool waits and database locks.',api_unavailable:'API readiness failed from this VPS. Check API, gateway and dependencies.',database_unavailable:'Database snapshot unavailable; do not interpret missing data as healthy.',container_unhealthy:'Inspect the failed/OOM container and its resource limit.'};
  function chart(parent,items){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 100');svg.setAttribute('role','img');svg.setAttribute('aria-label','CPU and memory percentage history, 0 to 100 percent');svg.style.cssText='width:100%;height:120px;background:var(--dashboard-soft,#14251c);border-radius:8px';
    const ordered=[...items].reverse();const start=Date.parse(ordered[0].observed_at),span=Math.max(1,Date.parse(ordered.at(-1).observed_at)-start);
    for(const [key,color] of [['cpu_percent','#65e7bd'],['memory_used_percent','#ffc96b']]){const points=ordered.filter(x=>typeof x.report.host?.[key]==='number').map(x=>`${(Date.parse(x.observed_at)-start)/span*600},${100-Math.max(0,Math.min(100,x.report.host[key]))}`).join(' ');const path=document.createElementNS(ns,'polyline');path.setAttribute('points',points);path.setAttribute('fill','none');path.setAttribute('stroke',color);path.setAttribute('stroke-width','2');svg.append(path);}
    parent.append(svg);line(parent,'Chart','CPU: mint · Memory: amber · 0–100%');
  }
  function render(data){
    content.replaceChildren();const now=Date.parse(data.server_time);let stale=false;
    for(const name of ['main','database']){
      const samples=data.items.filter(x=>x.host===name),last=samples[0],card=document.createElement('article');card.style.cssText='border:1px solid var(--dashboard-line,#345047);border-radius:12px;padding:14px;overflow:auto';content.append(card);
      const heading=document.createElement('h3');heading.textContent=name==='main'?'Main VPS':'Database VPS';card.append(heading);
      if(!last){line(card,'Monitoring','No samples received — not verified healthy');stale=true;continue;}
      const r=last.report,h=r.host||{},db=r.database||{},age=(now-Date.parse(last.observed_at))/1000;
      line(card,'Last sample',new Date(last.observed_at).toLocaleString()+(age>180?' — STALE':''));if(age>180)stale=true;
      for(const [label,value] of [['Host CPU %',h.cpu_percent],['Memory used %',h.memory_used_percent],['Disk used %',h.disk_used_percent],['Disk free GiB',h.disk_free_bytes/1073741824],['Disk read bytes/sec',h.disk_read_bytes_sec],['Disk write bytes/sec',h.disk_write_bytes_sec],['Mean disk I/O time ms',h.disk_mean_io_ms],['Network received bytes/sec',h.network_rx_bytes_sec],['Network sent bytes/sec',h.network_tx_bytes_sec],['API readiness',r.checks?.api_ready===true?'Passed':'FAILED'],['Operational email alerts',r.email_alerts_configured?'Configured':'Not configured']])line(card,label,value);
      chart(card,samples);
      for(const alert of r.alerts||[])line(card,'Sustained alert — '+alert,advice[alert]||'Inspect the measurements before scaling.');
      for(const issue of r.issues||[])line(card,'Incomplete check',issue);
      line(card,'PostgreSQL',`${format(db.connections)} / ${format(db.max_connections)} connections; ${format(db.lock_waiters)} lock waiters; ${format(db.idle_in_transaction)} idle transactions`);
      for(const [key,label] of [['email','Email'],['push','Push'],['media','Video processing']])line(card,label+' queue',`${format(db[key+'_pending'])} waiting; oldest ${format(db[key+'_oldest_seconds'])} sec`);
      line(card,'Email outbox sent total (application records)',db.email_sent_total);line(card,'Registered video asset bytes (not an S3 bill)',db.video_bytes_total);
      const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Containers and feature latency';details.append(summary);card.append(details);
      for(const c of r.containers||[]){const box=document.createElement('div');box.style.cssText='border-top:1px solid var(--dashboard-line,#345047);padding:10px 0';details.append(box);line(box,c.name,`${c.state} / ${c.health||'no health check'}; CPU ${format(c.cpu_cores)} cores; RAM ${format(c.memory)}; restarts ${format(c.restarts)}${c.oom_killed?' — OOM KILLED':''}`);line(box,'CPU periods throttled % (interval)',c.throttled_period_percent);line(box,'Memory cap used %',c.memory_limit_used_percent);line(box,'Network / disk I/O (cumulative)',`${format(c.network)} / ${format(c.disk_io)}`);
        if(c.metrics_unavailable)line(box,'API metrics','Unavailable');
        if(c.runtime){line(box,'DB pool',`${format(c.runtime.pool.acquired)} / ${format(c.runtime.pool.max)} in use`);line(box,'Interval mean acquire time (ms)',c.interval?.pool_wait_ms_per_acquire);line(box,'Interval pool cancellations',c.interval?.pool_cancelled);line(box,'Go heap MiB',c.runtime.go.heap_bytes/1048576);for(const [family,v] of Object.entries(c.interval?.groups||{}))line(box,family,`${format(v.rps)} req/sec; p95 ≤ ${format(v.p95_upper_ms)} ms; ${format(v.server_errors)} server errors / ${format(v.requests)} requests`);}
      }
    }
    status.textContent=stale?'Monitoring incomplete or stale. Resolve missing samples before making a scaling decision.':'Updated. Alerts require sustained conditions; review feature latency alongside host usage.';
  }
  async function load(){
    const owner=state.token+':'+state.role;
    if(state.role!=='super_admin'){panel.hidden=true;content.replaceChildren();latest=null;download.disabled=true;epoch++;actor=owner;return;}
    panel.hidden=false;if(state.activeTab!=='overview'||flight)return;
    if(actor!==owner){content.replaceChildren();latest=null;download.disabled=true;actor=owner;}
    const n=++epoch;flight=true;refresh.disabled=true;status.textContent='Loading capacity history…';
    try{const data=await request('/api/v1/admin/ops/capacity?hours='+range.value,{timeoutMs:10000,retry:false});if(n!==epoch||owner!==state.token+':'+state.role||state.role!=='super_admin')return;latest=data;render(data);download.disabled=false;}
    catch(error){if(n===epoch){status.textContent='Capacity history unavailable. '+error.message;latest=null;download.disabled=true;content.replaceChildren();}}
    finally{flight=false;refresh.disabled=false;}
  }
  refresh.onclick=load;range.onchange=load;download.onclick=async()=>{if(!latest||state.role!=='super_admin')return;const owner=state.token;download.disabled=true;try{const full=await request('/api/v1/admin/ops/capacity?hours='+range.value+'&full=1',{timeoutMs:15000,retry:false});if(owner!==state.token||state.role!=='super_admin')return;const url=URL.createObjectURL(new Blob([JSON.stringify(full,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='atl-capacity-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{status.textContent='Measurement download failed. Please retry.';}finally{download.disabled=!latest;}};
  const previousLoad=loadTabData;loadTabData=async function(tab,options){const result=previousLoad(tab,options);void load();return result;};
  setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);void load();
})();
