/* Jobs uses the existing admin authentication, role policy and stable review workspace. */
(() => {
  'use strict';
  const queue=document.getElementById('jobsQueue'),review=document.getElementById('jobReview');
  if(!queue||!review)return;
  let rows=[],selected=null,cursor='',readVersion=0,detailVersion=0,busy=false,actor='',filterTimer;
  const esc=value=>escapeHtml(String(value??''));
  const message=(text,error=false)=>{setText('jobsFeedback',text);document.getElementById('jobsFeedback').setAttribute('role',error?'alert':'status');};
  const allowed=()=>['super_admin','catalog_admin','moderation_admin'].includes(state.role)&&Boolean(state.token);
  const current=()=>allowed()&&state.activeTab==='jobs';
  const status=job=>job.effective_status||job.status;
  const badge=value=>`<span class="jobs-badge jobs-badge-${esc(value)}">${esc(value.replaceAll('_',' '))}</span>`;
  const externalDomain=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.hostname:'';}catch{return '';}};
  const originalLoad=loadTabData;
  loadTabData=(tab,options={})=>{if(tab!=='jobs'){detailVersion++;selected=null;return originalLoad(tab,options);}document.body.classList.add('providers-view');return load();};
  const previousReview=window.AtlProviderDocumentReview;
  window.AtlProviderDocumentReview={isOpen:()=>current()&&selected?.actor===state.token||previousReview?.isOpen()};
  for(const nav of document.querySelectorAll('.side-nav [data-tab="jobs"]'))nav.insertAdjacentHTML('afterbegin','<svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7h18v14H3ZM8 7V3h8v4M3 13h18M10 12h4v3h-4"/></svg>');
  function renderQueue(){queue.innerHTML=rows.length?rows.map(job=>`<button type="button" class="jobs-queue-row ${selected?.job.id===job.id?'selected':''}" data-job="${esc(job.id)}"><span><strong>${esc(job.title||'Untitled draft')}</strong><small>${esc(job.provider_name)} · ${esc([job.city,job.state].filter(Boolean).join(', '))}</small></span><span>${badge(status(job))}<small>${Number(job.open_reports)||0} open reports</small></span><span aria-hidden="true">›</span></button>`).join(''):'<p>No jobs match these filters.</p>';document.getElementById('jobsMore').classList.toggle('hidden',!cursor);}
  async function load(next=''){
    if(!current())return;const version=++readVersion,token=state.token;
    if(actor!==token){actor=token;rows=[];selected=null;review.replaceChildren();}
    message('Loading jobs…');
    try{const p=new URLSearchParams({limit:'25',search:document.getElementById('jobsSearch').value.trim(),status:document.getElementById('jobsStatus').value,reports:document.getElementById('jobsReports').value});if(next)p.set('cursor',next);
      const data=await request(`/api/v1/admin/jobs?${p}`);
      if(version!==readVersion||token!==state.token||!current())return;
      rows=next?[...rows,...data.items.filter(job=>!rows.some(old=>old.id===job.id))]:data.items;cursor=data.next_cursor||'';renderQueue();message(`${rows.length} job${rows.length===1?'':'s'} shown. Select a job to review.`);
      // Never replace an open review with a polling response. Revision checks guard writes.
    }catch(error){if(version===readVersion&&token===state.token)message(error.message,true);}
  }
  async function open(id){
    if(busy||!current())return;const version=++detailVersion,token=state.token;message('Loading job review…');
    try{const job=await request(`/api/v1/admin/jobs/${encodeURIComponent(id)}`);if(version!==detailVersion||token!==state.token||!current())return;selected={job,actor:token};renderReview();renderQueue();message('Review loaded. Changes require a moderation reason.');}catch(error){if(version===detailVersion&&token===state.token)message(error.message,true);}
  }
  function renderReview(){
    const job=selected?.job;if(!job)return;
    const destination=job.application_method==='external'?externalDomain(job.application_url):job.application_method==='email'?job.application_email:'Private ATL Xpres chat';
    const pay=job.pay_min==null?'Not specified':`${job.currency_code} ${job.pay_min}${job.pay_max==null?'':`–${job.pay_max}`} / ${job.pay_period}`;
    review.innerHTML=`<div class="section-head"><div><h3>Job review</h3><h2>${esc(job.title||'Untitled draft')}</h2><p>${esc(job.provider_name)}</p></div>${badge(status(job))}</div>
      <dl class="jobs-facts"><div><dt>Work type</dt><dd>${esc(job.work_type.replaceAll('_',' '))}</dd></div><div><dt>Location</dt><dd>${esc([job.city,job.state,job.country_code].filter(Boolean).join(', '))}</dd></div><div><dt>Pay</dt><dd>${esc(pay)}</dd></div><div><dt>Work duration</dt><dd>${esc(job.work_duration||'Not specified')}</dd></div><div><dt>Application deadline</dt><dd>${job.deadline?esc(new Date(job.deadline).toLocaleString()):'Not set'}</dd></div><div><dt>Application method</dt><dd>${esc(job.application_method)}</dd></div><div><dt>Destination</dt><dd>${esc(destination)}</dd></div></dl>
      ${job.application_method==='external'?`<p class="jobs-description">Full URL: ${esc(job.application_url)}</p>`:''}
      <h3>About the role</h3><p class="jobs-description">${esc(job.description||'Not supplied')}</p><h3>Requirements</h3><p class="jobs-description">${esc(job.requirements||'Not supplied')}</p><p class="jobs-description">${esc(job.application_instructions)}</p>
      <h3>Reports</h3><div class="jobs-reports">${(job.reports||[]).map(report=>`<article class="jobs-report"><div class="section-head"><strong>${esc(report.reason)}</strong>${badge(report.status==='open'?'open_report':'dismissed')}</div><small>Reported ${esc(new Date(report.created_at).toLocaleString())}</small>${report.review_notes?`<p>${esc(report.review_notes)}</p>`:''}${report.status==='open'?`<button type="button" class="secondary-button" data-dismiss-report="${esc(report.id)}">Dismiss this report</button>`:''}</article>`).join('')||'<p>No reports.</p>'}</div>
      <label>Moderation reason<textarea id="jobModerationReason" maxlength="1000" placeholder="Required before dismissing a report or removing a listing"></textarea></label>
      <div class="action-row"><button type="button" id="removeJob" class="jobs-danger" ${job.status==='removed'?'disabled':''}>Remove listing</button><button type="button" id="refreshJob" class="secondary-button">Refresh review</button></div>
      <details><summary>Moderation history</summary>${(job.history||[]).map(entry=>`<article class="jobs-report"><strong>${esc(entry.action.replaceAll('_',' '))}</strong><p>${esc(entry.reason)}</p><small>${esc(new Date(entry.created_at).toLocaleString())}</small></article>`).join('')||'<p>No moderation actions recorded.</p>'}</details>`;
  }
  async function moderate(action,reportID=''){
    if(busy||!current()||!selected||selected.actor!==state.token)return;
    const reason=document.getElementById('jobModerationReason')?.value.trim()||'';if(reason.length<3){message('Give a moderation reason of at least 3 characters.',true);return;}
    const snapshot=selected,token=state.token;if(action==='remove'&&!confirm('Remove this job from active results? Its history and applications will be preserved.'))return;
    busy=true;review.querySelectorAll('button,textarea').forEach(node=>node.disabled=true);
    try{const result=await request(`/api/v1/admin/jobs/${snapshot.job.id}/moderation`,{method:'POST',body:{action,report_id:reportID,reason,revision:snapshot.job.revision}});if(!result.confirmed)throw Error('Moderation is unconfirmed. Refresh before retrying.');if(token===state.token&&current()){busy=false;await open(snapshot.job.id);await load();message('Moderation action saved. Listing status and report status remain separate.');}}
    catch(error){if(token===state.token)message(`${error.message} Refresh the review before retrying.`,true);}
    finally{busy=false;if(selected===snapshot)review.querySelectorAll('button,textarea').forEach(node=>node.disabled=false);}
  }
  queue.addEventListener('click',event=>{const button=event.target.closest('[data-job]');if(button)void open(button.dataset.job);});
  review.addEventListener('click',event=>{if(event.target.closest('#refreshJob'))void open(selected?.job.id);else if(event.target.closest('#removeJob'))void moderate('remove');else{const button=event.target.closest('[data-dismiss-report]');if(button)void moderate('dismiss_report',button.dataset.dismissReport);}});
  document.getElementById('reloadJobs').addEventListener('click',()=>{if(!busy)void load();});
  document.getElementById('jobsMore').addEventListener('click',()=>{if(!busy&&cursor)void load(cursor);});
  document.getElementById('jobsSearch').addEventListener('input',()=>{clearTimeout(filterTimer);filterTimer=setTimeout(()=>{if(!busy)void load();},300);});
  for(const id of ['jobsStatus','jobsReports'])document.getElementById(id).addEventListener('change',()=>{if(!busy)void load();});
})();
