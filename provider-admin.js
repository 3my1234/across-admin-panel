/* Provider marketplace administration. Loaded after the main admin bundle. */
(() => {
  const PAGE_SIZE = 25;
  function providerFeedback(id,text,tone="loading"){setText(id,text);const node=$(id);if(node){node.dataset.feedback=tone;node.setAttribute("role",tone==="error"?"alert":"status");}}
  const navPaths={overview:'M3 10 12 3l9 7v11H3ZM9 21v-8h6v8',subscriptions:'M4 5h16v14H4ZM8 9h8M8 13h5',"service-moderation":'M3 4h18v17H3ZM7 9h10M7 14h10',"product-moderation":'M3 8l9-5 9 5v12H3ZM3 8l9 5 9-5M12 13v7',providers:'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a6 6 0 0 1 12 0v3ZM18 4v7M15 7h6M17 15h5v6h-5Z',"merchant-fulfillments":'M3 4h18v17H3ZM8 4v5h8V4M7 14h10M7 17h6',orders:'M5 6h14v15H5ZM9 6V3h6v3',transactions:'M4 5h16v14H4ZM8 9h8M8 13h5',waitlist:'M3 4h18v17H3ZM7 1v6M17 1v6M3 10h18',"xp-withdrawals":'M3 7h18v14H3ZM3 7l13-5v5M16 12h5v5h-5Z',support:'M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v8H3Zm14 0h4v8h-4Z',community:'M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z',analytics:'M4 21V11h4v10M10 21V3h4v18M16 21V7h4v14',complaints:'M12 3 2 21h20ZM12 9v6M12 18v1'};
  for(const button of document.querySelectorAll(".side-nav [data-tab]")){const d=navPaths[button.dataset.tab];if(d)button.insertAdjacentHTML("afterbegin",'<svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>');}
  const originalAllowedTabsForRole = allowedTabsForRole;
  allowedTabsForRole = (role = state.role) => {
    const tabs = originalAllowedTabsForRole(role);
    return tabs;
  };
  const originalLoadTabData = loadTabData;
  loadTabData = (tab, options = {}) => {
    document.body.classList.toggle("providers-view",["providers","service-moderation","product-moderation","subscriptions"].includes(tab));
    $("providerBillingSection")?.classList.toggle("hidden",state.role!=="super_admin");
    if (tab === "providers") return loadProviders({reset:true});
    if (tab === "service-moderation") return loadProviderListings({reset:true});
    if (tab === "product-moderation") return loadMerchantProducts({reset:true});
    return tab === "merchant-fulfillments" ? loadMerchantFulfillments({ reset: true }) : originalLoadTabData(tab, options);
  };

  state.providers = [];
  state.providerListings = [];
  state.providerCursor = "";
  state.providerHasMore = false;
  state.providerListingCursor = "";
  state.providerListingHasMore = false;
  state.merchantProducts = [];
  state.merchantProductCursor = "";
  state.merchantProductHasMore = false;
  state.merchantFulfillments = [];
  state.merchantFulfillmentCursor = "";
  state.merchantFulfillmentHasMore = false;
  state.providerPlans = [];
  state.providerAccess = null;
  state.gatewaySubscriptions = [];
  let billingLoadedAt = 0;
  let billingLoadPromise = null;
  let productLoadRevision = 0, listingLoadRevision = 0;
  const listingReviewState={listing:null,product:null};
  const providerReviewOwners = new WeakMap(), providerReviewData = new WeakMap();
  let providerLoadRevision = 0;

  function loadProviderBilling() {
    if (billingLoadPromise) return billingLoadPromise;
    if (Date.now() - billingLoadedAt < 60000) return Promise.resolve();
    billingLoadPromise = Promise.allSettled([loadProviderPlans().then(() => loadProviderPlans(true)), loadGatewaySubscriptions()]).finally(() => {
      billingLoadedAt = Date.now();
      billingLoadPromise = null;
    });
    return billingLoadPromise;
  }

  window.AtlProviderDocumentReview={isOpen:()=>state.activeTab === "providers" && Boolean(document.querySelector("#providerReviewPanel tr[data-provider-review-open]")) || state.activeTab === "service-moderation" && listingReviewState.listing?.actor===state.token || state.activeTab === "product-moderation" && listingReviewState.product?.actor===state.token};

  window.AtlProviderBilling={load:()=>Promise.all([loadProviderBilling(),loadProviderAccess()])};

  async function loadGatewaySubscriptions(fresh = false) {
    setText("gatewaySubscriptionsStatus", "Checking active Flutterwave renewals...");
    try {
      const data = await request(`/api/v1/admin/provider-gateway-subscriptions${fresh ? "?refresh=true" : ""}`);
      state.gatewaySubscriptions = data.items || [];
      renderGatewaySubscriptions();
      setText("gatewaySubscriptionsStatus", `${state.gatewaySubscriptions.length} active recurring subscription${state.gatewaySubscriptions.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setText("gatewaySubscriptionsStatus", error.message);
    }
  }

  function renderGatewaySubscriptions() {
    const table = $("gatewaySubscriptionsTable");
    table.innerHTML = `<thead><tr><th>Subscription</th><th>Customer</th><th>Flutterwave plan</th><th>Recurring amount</th><th>Action</th></tr></thead><tbody>${state.gatewaySubscriptions.map((item) => `<tr><td>${escapeHtml(String(item.id))}</td><td>${escapeHtml(item.customer_email || "Unavailable")}</td><td>${escapeHtml(String(item.plan_id))}</td><td>NGN ${Number(item.amount_ngn || 0).toLocaleString()} / month</td><td><button type="button" class="danger-button" data-stop-renewal="${item.id}">Stop renewal</button></td></tr>`).join("") || '<tr><td colspan="5">No active renewals found for linked provider plans.</td></tr>'}</tbody>`;
    table.querySelectorAll("[data-stop-renewal]").forEach((button) => button.addEventListener("click", () => cancelGatewaySubscription(button.dataset.stopRenewal)));
  }

  async function cancelGatewaySubscription(id) {
    const subscription = state.gatewaySubscriptions.find((item) => String(item.id) === String(id));
    if (!subscription || !confirm(`Stop future Flutterwave renewals for subscription ${id} (${subscription.customer_email || "unknown customer"})? This does not refund earlier charges. This does not change already-paid access; future access follows the existing subscription rules.`)) return;
    const button = document.querySelector(`[data-stop-renewal="${id}"]`);
    button.disabled = true;
    setText("gatewaySubscriptionsStatus", `Cancelling subscription ${id} with Flutterwave...`);
    try {
      await request(`/api/v1/admin/provider-gateway-subscriptions/${id}/cancel`, { method: "POST" });
      await loadGatewaySubscriptions(true);
      setText("gatewaySubscriptionsStatus", `Flutterwave confirmed subscription ${id} is no longer active.`);
    } catch (error) {
      setText("gatewaySubscriptionsStatus", error.message);
      button.disabled = false;
    }
  }

  function localDateTimeValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function renderProviderAccess() {
    setText("providerAccessStatus", "Free: one listing total across all categories after document approval. Paid subscriptions unlock more listings and coloured badges. The temporary free-launch period has been retired.");
  }

  async function loadProviderAccess() {
    try {
      state.providerAccess = await request("/api/v1/admin/provider-subscription-access");
      renderProviderAccess();
    } catch (error) {
      setText("providerAccessStatus", error.message);
    }
  }

  function queryParams(searchID, statusID, cursor) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const search = ($(searchID)?.value || "").trim();
    const status = $(statusID)?.value || "";
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (cursor) params.set("cursor", cursor);
    return params;
  }

  async function loadProviders({ reset = false } = {}) {
    const revision = ++providerLoadRevision, actor = state.token;
    providerFeedback("providerStatus", "Loading providers...");
    try {
      const data = await request(`/api/v1/admin/providers?${queryParams("providerSearch", "providerVerificationStatus", reset ? "" : state.providerCursor)}`);
      if (revision !== providerLoadRevision || actor !== state.token) return;
      state.providers = reset ? (data.items || []) : [...state.providers, ...(data.items || [])];
      state.providerCursor = data.next_cursor || ""; state.providerHasMore = Boolean(data.has_more);
      renderProviders(); providerFeedback("providerStatus", `${state.providers.length} providers loaded.`,"success");
    } catch (error) { if(revision === providerLoadRevision && actor === state.token) providerFeedback("providerStatus", error.message,"error"); }
  }

  async function loadProviderListings({ reset = false } = {}) {
    const revision = ++listingLoadRevision, actor=state.token;
    providerFeedback("providerListingStatus", "Loading listings...");
    try {
      const data = await request(`/api/v1/admin/provider-listings?${queryParams("providerListingSearch", "providerListingModerationStatus", reset ? "" : state.providerListingCursor)}`);
      if (revision !== listingLoadRevision || actor!==state.token) return false;
      state.providerListings = reset ? (data.items || []) : [...state.providerListings, ...(data.items || [])];
      state.providerListingCursor = data.next_cursor || ""; state.providerListingHasMore = Boolean(data.has_more);
      renderProviderListings(); providerFeedback("providerListingStatus", `${state.providerListings.length} listings loaded.`,"success");
      return true;
    } catch (error) { if (revision === listingLoadRevision && actor===state.token) providerFeedback("providerListingStatus", error.message,"error"); return false; }
  }

  async function loadMerchantProducts({ reset = false } = {}) {
    const revision = ++productLoadRevision, actor=state.token;
    providerFeedback("merchantProductModerationStatus", "Loading merchant products...");
    try {
      const data = await request(`/api/v1/admin/merchant-products?${queryParams("merchantProductSearch", "merchantProductStatus", reset ? "" : state.merchantProductCursor)}`);
      if (revision !== productLoadRevision || actor!==state.token) return false;
      state.merchantProducts = reset ? (data.items || []) : [...state.merchantProducts, ...(data.items || [])];
      state.merchantProductCursor = data.page?.next_cursor || ""; state.merchantProductHasMore = Boolean(data.page?.has_more);
      renderMerchantProducts(); providerFeedback("merchantProductModerationStatus", `${state.merchantProducts.length} merchant products loaded.`,"success");
      return true;
    } catch (error) { if (revision === productLoadRevision && actor===state.token) providerFeedback("merchantProductModerationStatus", error.message,"error"); return false; }
  }

  const documentNames={government_id:'Government-issued ID',drivers_license:'Driver licence',driver_face:'Clear face photo',driver_vehicle:'Vehicle photo',driver_plate:'Plate photo',vehicle_registration:'Vehicle registration'};
  function reviewBadge(status) {
    const labels={pending:'Needs review',approved:'Approved',rejected:'Needs replacement',suspended:'Suspended',missing:'Missing',expired:'Expired'};
    return `<span class="review-badge review-${escapeHtml(status)}">${escapeHtml(labels[status]||status)}</span>`;
  }
  function documentReviewModel(data) {
    const latest=new Map();
    for(const doc of data.items||[]) if(!latest.has(doc.document_type)) latest.set(doc.document_type,doc);
    const today=new Date().toISOString().slice(0,10);
    const current=doc=>!!doc&&doc.status==='approved'&&(!doc.expires_on||doc.expires_on.slice(0,10)>=today)&&(doc.document_type!=='drivers_license'||!!doc.expires_on);
    const rows=(data.required_documents||[]).map(kind=>{
      let doc=latest.get(kind);
      if(kind==='government_id'&&!current(doc)&&current(latest.get('drivers_license')))doc=latest.get('drivers_license');
      const expired=doc&&((doc.expires_on&&doc.expires_on.slice(0,10)<today)||(doc.document_type==='drivers_license'&&doc.status==='approved'&&!doc.expires_on));
      return {kind,doc,status:!doc?'missing':expired?'expired':doc.status,approved:current(doc)};
    });
    return {rows,approved:rows.filter(row=>row.approved).length,ready:rows.length>0&&rows.every(row=>row.approved)};
  }
  function renderProviderQueue() {
    const selected=document.querySelector('#providerReviewBody tr[data-provider-review-open]')?.dataset.providerReviewOpen;
    $('providersTable').innerHTML=`<tbody>${state.providers.map(item=>`<tr><td><button type="button" class="provider-queue-item" data-provider-docs="${escapeHtml(item.id)}" aria-pressed="${selected===item.id}"><span class="review-avatar" aria-hidden="true">${escapeHtml((item.business_name||'P').trim().slice(0,1))}</span><span class="provider-queue-copy"><strong>${escapeHtml(item.business_name)}</strong><span>${escapeHtml(item.is_driver?'Driver / rider':(item.provider_type||'Provider').replaceAll('_',' '))}</span><span>${escapeHtml([item.city,item.state].filter(Boolean).join(', ')||'Location not supplied')}</span></span>${reviewBadge(item.verification_status)}<span aria-hidden="true">›</span></button></td></tr>`).join('')||'<tr><td>No matching providers.</td></tr>'}</tbody>`;
    setText('providerQueueTitle',`Provider queue (${state.providers.length}${state.providerHasMore?'+':''})`);
    $('loadMoreProvidersButton')?.classList.toggle('hidden',!state.providerHasMore);
    $('providersTable').querySelectorAll('[data-provider-docs]').forEach(button=>button.onclick=()=>loadProviderDocuments(button.dataset.providerDocs));
  }
  function renderProviders() {
    const row=document.querySelector('#providerReviewBody tr[data-provider-review-open]');
    if(row&&providerReviewOwners.get(row)!==state.token){$('providerReviewBody').textContent='';$('providerReviewEmpty').classList.remove('hidden');}
    // The review lives outside the queue. Reloads retain its actual DOM, selection
    // and checked evidence even if the selected provider is not in this filter.
    renderProviderQueue();
  }
  function closeProviderReview(row) {
    if(row.dataset.reviewBusy==='true')return;
    delete row.dataset.providerReviewOpen;row.classList.add('hidden');
    row.querySelector('[data-provider-documents]').textContent='';providerReviewData.delete(row);
    $('providerReviewEmpty').classList.remove('hidden');renderProviderQueue();
  }
  async function loadProviderDocuments(providerID) {
    let row=document.querySelector('#providerReviewBody tr[data-provider-review-open]');
    if(row?.dataset.reviewBusy==='true')return;
    if(!row||row.dataset.providerReviewOpen!==providerID){
      $('providerReviewBody').innerHTML=`<tr id="provider-docs-${escapeHtml(providerID)}"><td><div data-provider-documents></div></td></tr>`;
      row=$(`provider-docs-${providerID}`);
    }
    const cell=row.querySelector('[data-provider-documents]'),actor=state.token;
    const revision=String(Number(row.dataset.documentRevision||0)+1);
    providerReviewOwners.set(row,actor);row.dataset.documentRevision=revision;row.dataset.providerReviewOpen=providerID;
    row.classList.remove('hidden');$('providerReviewEmpty').classList.add('hidden');renderProviderQueue();
    cell.innerHTML='<button type="button" class="secondary-button" data-close-provider-review>Close document review</button><p role="status">Loading documents…</p>';
    cell.querySelector('[data-close-provider-review]').onclick=()=>closeProviderReview(row);
    try {
      const data=await request(`/api/v1/admin/providers/${providerID}/verification-documents`);
      if(actor!==state.token||!row.isConnected||row.dataset.providerReviewOpen!==providerID||row.dataset.documentRevision!==revision)return;
      providerReviewData.set(row,data);renderDocumentWorkspace(row,data);
    }catch(error){if(actor===state.token&&row.isConnected&&row.dataset.providerReviewOpen===providerID&&row.dataset.documentRevision===revision){cell.textContent=error.message;const close=document.createElement('button');close.textContent='Close document review';close.className='secondary-button';close.onclick=()=>closeProviderReview(row);cell.append(close);}}
  }
  function renderDocumentWorkspace(row,data) {
    const providerID=row.dataset.providerReviewOpen,item=state.providers.find(item=>item.id===providerID)||{},model=documentReviewModel(data);
    const docs=data.items||[],selected=docs.find(doc=>doc.id===row.dataset.selectedDocument)||model.rows.find(entry=>entry.doc&&entry.status!=='approved')?.doc||model.rows.find(entry=>entry.doc)?.doc||docs[0];
    row.dataset.selectedDocument=selected?.id||'';row.dataset.requiredApproved=String(model.ready);
    const name=escapeHtml(data.driver_name||item.business_name||'Provider'),cell=row.querySelector('[data-provider-documents]');
    const documentLabel=doc=>documentNames[doc.document_type]||doc.document_type.replaceAll('_',' ');
    const safeURL=doc=>{try{const url=new URL(doc.document_url);return url.protocol==='https:'?escapeHtml(url.href):'';}catch{return '';}};
    const evidence=selected&&['drivers_license','driver_face','driver_vehicle','driver_plate','vehicle_registration','vehicle_insurance','roadworthiness','driver_lasrra','driver_lasdri'].includes(selected.document_type);
    cell.innerHTML=`<div class="review-heading"><div><h3>Document review</h3><h2>${escapeHtml(item.business_name||data.driver_name||'Provider')}</h2><p>${escapeHtml(data.is_driver?'Driver / rider':(item.provider_type||'Provider').replaceAll('_',' '))} · ${escapeHtml([item.city,item.state].filter(Boolean).join(', ')||'Location not supplied')}</p></div><button type="button" data-close-provider-review="${escapeHtml(providerID)}" class="secondary-button" aria-label="Close document review">Close</button></div>
      <div class="review-progress"><strong>${model.approved} of ${model.rows.length} required documents approved</strong><progress aria-label="Required documents approved" value="${model.approved}" max="${Math.max(1,model.rows.length)}"></progress></div>
      <div class="review-document-list"><table><thead><tr><th>Document</th><th>Status</th><th>Action</th></tr></thead><tbody>${model.rows.map(entry=>`<tr class="${selected?.id===entry.doc?.id&&entry.doc?'selected-document':''}"><td><strong>${escapeHtml(documentNames[entry.kind]||entry.kind)}</strong>${entry.kind==='drivers_license'?'<small>Also serves as ID</small>':''}</td><td>${reviewBadge(entry.status)}</td><td>${entry.doc?`<button type="button" class="secondary-button" data-select-document="${escapeHtml(entry.doc.id)}" aria-pressed="${selected?.id===entry.doc.id}">${entry.approved?'View':'Review'}</button>`:'<span class="muted">Not submitted</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${selected?`<section class="review-document-preview" aria-label="Selected verification document"><div class="review-original"><a ${safeURL(selected)?`href="${safeURL(selected)}"`:''} target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${safeURL(selected)&&!new URL(selected.document_url).pathname.toLowerCase().endsWith('.pdf')?`<img src="${safeURL(selected)}" alt="Selected document preview" referrerpolicy="no-referrer">`:'<span aria-hidden="true">▤</span>'}</a></div><div class="review-preview-copy"><h4>${escapeHtml(documentLabel(selected))}</h4><p>Expiry entered by applicant: ${escapeHtml(selected.expires_on||'Not supplied')}</p><p>Account owner / driver name: ${name}</p>${safeURL(selected)?`<a href="${safeURL(selected)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open original ↗</a>`:'<p>Original unavailable. Reload the review to request a fresh authorized link.</p>'}${selected.review_notes?`<p>${escapeHtml(selected.review_notes)}</p>`:''}</div>
      ${evidence?`<label class="review-evidence"><input type="checkbox" data-driver-evidence="${escapeHtml(selected.id)}"> I reviewed the original evidence: the face matches the licence, the vehicle/plate match the registration, and any expiry date matches the document.</label>`:''}
      <div class="review-document-actions"><button type="button" data-review-doc="${escapeHtml(selected.id)}" data-provider="${escapeHtml(providerID)}" data-status="approved">Approve document</button><button type="button" data-review-doc="${escapeHtml(selected.id)}" data-provider="${escapeHtml(providerID)}" data-status="rejected" class="danger-button">Request resubmission</button></div></section>`:'<div class="provider-review-empty">No documents uploaded yet.</div>'}
      <details class="review-history"><summary>Submission history (${docs.length})</summary>${docs.map(doc=>`<div><span><strong>${escapeHtml(documentLabel(doc))}</strong><small>${escapeHtml(doc.created_at?format(doc.created_at):'Submission date unavailable')}</small></span>${reviewBadge(doc.status)}<button type="button" class="secondary-button" data-select-document="${escapeHtml(doc.id)}">View submission</button></div>`).join('')||'<p>No submissions yet.</p>'}</details>
      <div class="review-provider-actions"><button type="button" data-provider-status="approved" data-id="${escapeHtml(providerID)}" ${model.ready?'':'disabled'}>Approve provider</button><p>${model.ready?'Required documents approved. Provider approval does not automatically approve suspended services.':'Approve all required documents first. A current approved driver licence also counts as ID.'}</p></div>
      <details class="review-other-actions"><summary>Other provider actions</summary><div class="table-actions"><button type="button" class="danger-button" data-provider-status="rejected" data-id="${escapeHtml(providerID)}">Reject provider</button><button type="button" class="danger-button" data-provider-status="suspended" data-id="${escapeHtml(providerID)}">Suspend provider</button></div></details>
      <p class="muted review-privacy">Only authorized reviewers can open identity documents. Only approved face, vehicle and plate photos are shown to customers.</p>`;
    cell.querySelector('[data-close-provider-review]').onclick=()=>closeProviderReview(row);
    cell.querySelectorAll('[data-select-document]').forEach(button=>button.onclick=()=>{if(row.dataset.reviewBusy==='true')return;row.dataset.selectedDocument=button.dataset.selectDocument;renderDocumentWorkspace(row,data);});
    cell.querySelectorAll('[data-review-doc]').forEach(button=>button.onclick=()=>reviewDocument(providerID,button.dataset.reviewDoc,button.dataset.status));
    cell.querySelectorAll('[data-provider-status]').forEach(button=>button.onclick=()=>moderateProvider(providerID,button.dataset.providerStatus));
    cell.querySelectorAll('.review-original img').forEach(img=>img.onerror=()=>{img.remove();});
  }
  async function reviewDocument(providerID,documentID,status) {
    const row=$(`provider-docs-${providerID}`),actor=state.token;
    if(!row||row.dataset.reviewBusy==='true'||providerReviewOwners.get(row)!==actor)return;
    const evidence=row.querySelector(`[data-driver-evidence="${documentID}"]`);
    if(status==='approved'&&evidence&&!evidence.checked){providerFeedback('providerStatus','Review the driver evidence and confirm the matching expiry date before approval.','error');return;}
    const notes=prompt(`${status} document. Add a note (optional):`,'');if(notes===null)return;
    const controls=Array.from(row.querySelectorAll('button'),button=>[button,button.disabled]);
    row.dataset.reviewBusy='true';controls.forEach(([button])=>button.disabled=true);
    try{await request(`/api/v1/admin/providers/${providerID}/verification-documents/${documentID}`,{method:'PATCH',body:{status,notes,evidence_confirmed:!!evidence?.checked}});
      delete row.dataset.reviewBusy;if(actor===state.token&&row.isConnected&&row.dataset.providerReviewOpen===providerID)await loadProviderDocuments(providerID);
    }catch(error){if(actor===state.token)providerFeedback('providerStatus',error.message,'error');}
    finally{delete row.dataset.reviewBusy;if(actor===state.token&&row.isConnected)controls.forEach(([button,disabled])=>{if(button.isConnected)button.disabled=disabled;});}
  }
  async function moderateProvider(id,status) {
    const row=$(`provider-docs-${id}`),actor=state.token;
    if(!row||row.dataset.reviewBusy==='true'||providerReviewOwners.get(row)!==actor)return;
    if(status==='approved'&&row.dataset.requiredApproved!=='true'){providerFeedback('providerStatus','Approve all required documents first.','error');return;}
    const notes=prompt(`${status} provider. Add an internal note (optional):`,'');if(notes===null)return;
    const controls=Array.from(row.querySelectorAll('button'),button=>[button,button.disabled]);
    row.dataset.reviewBusy='true';controls.forEach(([button])=>button.disabled=true);
    try{await request(`/api/v1/admin/providers/${id}/verification`,{method:'PATCH',body:{status,notes}});if(actor===state.token){await loadProviders({reset:true});providerFeedback('providerStatus',`Provider confirmed ${status}.`,'success');}}
    catch(error){if(actor===state.token)providerFeedback('providerStatus',error.message,'error');}
    finally{delete row.dataset.reviewBusy;if(actor===state.token&&row.isConnected)controls.forEach(([button,disabled])=>{if(button.isConnected)button.disabled=disabled;});}
  }

  function listingWorkspace(kind) {
    return kind==='listing'?{items:state.providerListings,table:'providerListingsTable',panel:'serviceReviewPanel',more:'loadMoreProviderListingsButton',hasMore:state.providerListingHasMore,feedback:'providerListingStatus',label:'Service'}:{items:state.merchantProducts,table:'merchantProductsTable',panel:'productReviewPanel',more:'loadMoreMerchantProductsButton',hasMore:state.merchantProductHasMore,feedback:'merchantProductModerationStatus',label:'Product'};
  }
  function listingVersion(item) {
    if(item.content_revision!=null)return JSON.stringify([item.content_revision,item.status||item.moderation_status]);
    // Products without a server content revision still detect changed queue data.
    const copy={...item};delete copy.provider_identity;
    return JSON.stringify(copy);
  }
  function listingImages(kind,item) {
    return (kind==='listing'?item.media_urls||[]:item.image_urls||[]).filter(url=>typeof url==='string'&&/^https?:\/\//i.test(url));
  }
  function renderListingQueue(kind) {
    const config=listingWorkspace(kind);let review=listingReviewState[kind];
    if(review&&review.actor!==state.token){listingReviewState[kind]=review=null;$(config.panel).innerHTML='<div class="provider-review-empty">Select an item to review.</div>';}
    $(config.table).innerHTML=`<tbody>${config.items.map(item=>{const image=listingImages(kind,item)[0];return `<tr><td><button type="button" class="provider-queue-item listing-queue-item" data-open-listing-review="${escapeHtml(item.id)}" aria-pressed="${review?.item.id===item.id}">${image?`<img class="queue-listing-image" src="${escapeHtml(image)}" alt="" loading="lazy">`:'<span class="review-avatar" aria-hidden="true">▧</span>'}<span class="provider-queue-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.provider_name||item.provider_identity?.name||'Provider')}</span><span>${escapeHtml([item.city,item.state].filter(Boolean).join(', ')||item.sku||'Location not supplied')}</span></span>${reviewBadge(item.status||item.moderation_status||'draft')}<span aria-hidden="true">›</span></button></td></tr>`;}).join('')||`<tr><td>No matching ${config.label.toLowerCase()}s.</td></tr>`}</tbody>`;
    $(config.more)?.classList.toggle('hidden',!config.hasMore);
    $(config.table).querySelectorAll('[data-open-listing-review]').forEach(button=>button.onclick=()=>openListingReview(kind,button.dataset.openListingReview));
    if(review){const current=config.items.find(item=>item.id===review.item.id);
      review.stale=!current||listingVersion(current)!==review.version;
      const notice=$(config.panel).querySelector('[data-listing-stale]');if(notice){notice.classList.toggle('hidden',!review.stale);notice.textContent=review.stale?'The queue changed or this item is outside the current filter. Reload this review from the current queue before moderating.':'';}
      $(config.panel).querySelectorAll('[data-listing-status],[data-product-status]').forEach(button=>button.disabled=review.stale||moderationFlights.has(kind+':'+review.item.id));
    }
  }
  function openListingReview(kind,id) {
    const config=listingWorkspace(kind),existing=listingReviewState[kind];
    if(existing&&moderationFlights.has(kind+':'+existing.item.id))return;
    const item=config.items.find(item=>item.id===id);if(!item)return;
    listingReviewState[kind]={actor:state.token,item:JSON.parse(JSON.stringify(item)),version:listingVersion(item),image:0,stale:false};
    renderListingDetail(kind);renderListingQueue(kind);
  }
  function renderListingDetail(kind) {
    const config=listingWorkspace(kind),review=listingReviewState[kind];if(!review||review.actor!==state.token)return;
    const item=review.item,images=listingImages(kind,item),product=kind==='product',status=item.status||item.moderation_status||'draft';
    const field=(label,value)=>`<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value==null||value===''?'Not supplied':String(value))}</dd></div>`;
    const price=product?`${item.currency_code||''} ${format(item.local_selling_price)}`:item.price==null||item.attributes?.price_mode==='quote'?'Ask for a quote':`${item.attributes?.price_mode==='from'?'From ':''}${item.currency_code||''} ${format(item.price)} / ${item.pricing_unit||'unit'}`;
    $(config.panel).innerHTML=`<div class="review-heading"><div><h3>${config.label} review</h3><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.provider_name||item.provider_identity?.name||'Provider')}</p></div><button type="button" class="secondary-button" data-close-listing-review>Close</button></div>
      <div class="listing-review-identity">${window.ProviderIdentity?.render(item.provider_identity)||''}${reviewBadge(status)}</div>
      <p data-listing-stale class="listing-review-notice hidden" role="status"></p>
      <div class="listing-review-gallery">${images.length?`<a class="listing-main-photo" href="${escapeHtml(images[review.image]||images[0])}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(images[review.image]||images[0])}" alt="${escapeHtml(item.title)} — selected photo"></a><div class="listing-review-thumbnails" aria-label="Listing photos">${images.map((url,index)=>`<button type="button" data-listing-photo="${index}" aria-label="View photo ${index+1}" aria-pressed="${index===review.image}"><img src="${escapeHtml(url)}" alt="" loading="lazy"></button>`).join('')}</div>`:'<div class="listing-no-photo">No photos supplied</div>'}</div>
      <dl class="listing-review-facts">${field('Price',price)}${product?field('Stock',item.inventory_count)+field('SKU',item.sku)+field('Payment options',item.payment_mode):field('Service type',(item.listing_type||'').replaceAll('_',' '))+field('Category',item.category)}${field('Location',[item.city,item.state,item.country_code].filter(Boolean).join(', '))}${product&&item.compare_at_price?field('Previous price',`${item.currency_code||''} ${format(item.compare_at_price)}`):''}${field('Review status',status)}</dl>
      <section class="listing-review-description"><h4>Description</h4><p>${escapeHtml(item.description||'No description supplied.')}</p></section>
      ${product?`<section class="listing-review-description"><h4>Delivery and buyer prices</h4>${merchantBuyerPriceSummary(item)||'<p>No delivery areas supplied.</p>'}</section>`:`<section class="listing-review-description"><h4>Changes since last approval</h4>${window.ListingReview?.render(item)||'<p>Change history unavailable.</p>'}</section>`}
      ${item.moderation_notes?`<section class="listing-review-description"><h4>Moderation notes</h4><p>${escapeHtml(item.moderation_notes)}</p></section>`:''}
      <div class="review-document-actions listing-review-actions">${[['approved','Approve '+config.label.toLowerCase()],['rejected','Request changes'],['suspended','Suspend']].map(([value,label])=>`<button type="button" data-${product?'product':'listing'}-status="${value}" data-id="${escapeHtml(item.id)}" class="${value==='approved'?'':'danger-button'}">${label}</button>`).join('')}</div>
      <p class="muted review-privacy">Approval checks provider eligibility and publication rules on the server. No moderation action changes the provider's subscription.</p>`;
    const panel=$(config.panel);
    panel.querySelector('[data-close-listing-review]').onclick=()=>{if(moderationFlights.has(kind+':'+item.id))return;listingReviewState[kind]=null;panel.innerHTML='<div class="provider-review-empty">Select an item from the queue to review.</div>';renderListingQueue(kind);};
    panel.querySelectorAll('[data-listing-photo]').forEach(button=>button.onclick=()=>{review.image=Number(button.dataset.listingPhoto);const image=images[review.image],anchor=panel.querySelector('.listing-main-photo');anchor.href=image;anchor.querySelector('img').src=image;panel.querySelectorAll('[data-listing-photo]').forEach(photo=>photo.setAttribute('aria-pressed',String(photo===button)));});
    panel.querySelectorAll('[data-listing-status],[data-product-status]').forEach(button=>{button.reviewItem=review.item;button.reviewActor=review.actor;button.onclick=()=>product?moderateMerchantProductVerified(button):moderateListingVerified(button);button.disabled=review.stale||moderationFlights.has(kind+':'+item.id);});
  }
  function validateListingReview(kind,button) {
    const review=listingReviewState[kind],config=listingWorkspace(kind),current=config.items.find(item=>item.id===button.dataset.id);
    if(!review||review.actor!==state.token||button.reviewActor!==state.token||review.item!==button.reviewItem||review.stale||!current||listingVersion(current)!==review.version){providerFeedback(config.feedback,'Reload the latest listing review before moderating.','error');return false;}
    return true;
  }
  function confirmListingReview(kind,id,result,actor) {
    const review=listingReviewState[kind];if(!review||review.actor!==actor||state.token!==actor||review.item.id!==id)return;
    review.item[kind==='listing'?'status':'moderation_status']=result.status;
    review.version=listingVersion(review.item);renderListingDetail(kind);
  }
  function renderProviderListings(){renderListingQueue('listing');}
  const moderationFlights = new Set();
  async function moderateListingVerified(button) {
    const id = button.dataset.id; const status = button.dataset.listingStatus;
    if(moderationFlights.has('listing:'+id)||!validateListingReview('listing',button))return;
    const actor=state.token;
    const notes = prompt(status + " listing. Add an internal note (optional):", ""); if (notes === null) return;
    if(moderationFlights.has('listing:'+id))return; moderationFlights.add('listing:'+id); button.disabled=true; button.setAttribute('aria-busy','true');
    try {
      const item=button.reviewItem||state.providerListings.find(listing=>listing.id===id);
      const result = await request("/api/v1/admin/provider-listings/" + id + "/moderation", { method: "PATCH", body: { status, notes,expected_content_revision:item?.content_revision } });
      if (result.id !== id || result.status !== status) throw new Error("The server did not confirm this moderation change.");
      if(actor!==state.token)return;confirmListingReview('listing',id,result,actor);
      await loadProviderListings({ reset: true });
      if(actor!==state.token)return;setText("providerListingStatus", result.title + " (listing " + id.slice(0, 8) + ") is confirmed " + status + ".");
    } catch (error) { if(actor===state.token)providerFeedback("providerListingStatus", error.message,"error"); }
    finally { moderationFlights.delete('listing:'+id); button.disabled=false; button.removeAttribute('aria-busy');if(actor===state.token)renderListingQueue('listing'); }
  }
  function merchantBuyerPriceSummary(item) {
    return (item.delivery_areas || []).map(area => {
      const itemPrice = Number(area.delivered_price) - Number(area.delivery_fee || 0);
      const mismatch = area.currency_code === item.currency_code && itemPrice !== Number(item.local_selling_price);
      return `<br><span class="${mismatch ? "error" : "muted"}">Buyer ${escapeHtml([area.country_code, area.state, area.city].filter(Boolean).join(" / "))}: ${escapeHtml(area.currency_code)} ${itemPrice.toFixed(2)} + ${Number(area.delivery_fee || 0).toFixed(2)} delivery${mismatch ? " — separate from main price" : ""}</span>`;
    }).join("");
  }
  function renderMerchantProducts(){renderListingQueue('product');}
  async function moderateMerchantProductVerified(button) {
    const id = button.dataset.id; const status = button.dataset.productStatus;
    if(moderationFlights.has('product:'+id)||!validateListingReview('product',button))return;
    const actor=state.token,product=button.reviewItem||state.merchantProducts.find(item => item.id === id);
    const separate = (product?.delivery_areas || []).filter(area => area.currency_code === product.currency_code && Number(area.delivered_price) - Number(area.delivery_fee || 0) !== Number(product.local_selling_price));
    if (status === "approved" && separate.length && !confirm(`Buyers will pay separate destination item prices (${separate.map(area => `${area.country_code}: ${area.currency_code} ${(Number(area.delivered_price) - Number(area.delivery_fee || 0)).toFixed(2)}`).join(", ")}), rather than the main price ${product.currency_code} ${product.local_selling_price}. Approve those exact buyer prices? Cancel and ask the provider to use the main price if this is unintended.`)) return;
    const notes = prompt(`${status} product. Add a moderation note (optional):`, ""); if (notes === null) return;
    if(moderationFlights.has('product:'+id))return; moderationFlights.add('product:'+id); button.disabled=true; button.setAttribute('aria-busy','true');
    try {
      const result = await request(`/api/v1/admin/merchant-products/${id}/moderation`, { method: "PATCH", body: { status, notes } });
      if (result.id !== id || result.status !== status) throw new Error("The server did not confirm this product moderation change.");
      if(actor!==state.token)return;confirmListingReview('product',id,result,actor);
      await loadMerchantProducts({ reset: true });
      if(actor!==state.token)return;setText("merchantProductModerationStatus", result.title + " (product " + id.slice(0, 8) + ") is confirmed " + status + ".");
    }
    catch (error) { if(actor===state.token)providerFeedback("merchantProductModerationStatus", error.message,"error"); }
    finally { moderationFlights.delete('product:'+id); button.disabled=false; button.removeAttribute('aria-busy');if(actor===state.token)renderListingQueue('product'); }
  }

  async function loadMerchantFulfillments({ reset = false } = {}) {
    setText("merchantFulfillmentStatus", "Loading merchant fulfilment...");
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const search = ($("merchantFulfillmentSearch")?.value || "").trim();
    const route = $("merchantFulfillmentRoute")?.value || "";
    const status = ($("merchantFulfillmentStatusFilter")?.value || "").trim();
    if (search) params.set("search", search);
    if (route) params.set("route_type", route);
    if (status) params.set("status", status);
    if (!reset && state.merchantFulfillmentCursor) params.set("cursor", state.merchantFulfillmentCursor);
    try {
      const data = await request(`/api/v1/admin/merchant-fulfillments?${params}`);
      state.merchantFulfillments = reset ? (data.items || []) : [...state.merchantFulfillments, ...(data.items || [])];
      state.merchantFulfillmentCursor = data.page?.next_cursor || "";
      state.merchantFulfillmentHasMore = Boolean(data.page?.has_more);
      renderMerchantFulfillments();
      setText("merchantFulfillmentStatus", `${state.merchantFulfillments.length} fulfilments loaded.`);
    } catch (error) { setText("merchantFulfillmentStatus", error.message); }
  }

  function renderMerchantFulfillments() {
    const table = $("merchantFulfillmentsTable");
    if (!table) return;
    table.innerHTML = `<thead><tr><th>Order</th><th>Seller</th><th>Route</th><th>Status</th><th>Carrier / tracking</th><th>Location</th><th>Updated</th></tr></thead><tbody>${state.merchantFulfillments.map((item) =>
      `<tr><td><strong>${escapeHtml(item.package_label || item.order_id)}</strong></td><td>${escapeHtml(item.provider_name || "-")}</td><td>${escapeHtml((item.route_type || "").replaceAll("_", " "))}</td><td><span class="status-pill">${escapeHtml((item.status || "").replaceAll("_", " "))}</span></td><td>${escapeHtml(item.carrier || "Seller managed")}<br><span class="muted">${escapeHtml(item.tracking_number || "No tracking number")}</span></td><td>${escapeHtml(item.current_location || "-")}</td><td>${format(item.updated_at)}</td></tr>`
    ).join("") || `<tr><td colspan="7">No matching seller fulfilments.</td></tr>`}</tbody>`;
    $("loadMoreMerchantFulfillmentsButton")?.classList.toggle("hidden", !state.merchantFulfillmentHasMore);
  }
  async function saveProviderPlan(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const submitButton = formElement.querySelector('button[type="submit"]');
    const form = new FormData(formElement);
    setText("providerPlanStatus", "Saving subscription plan...");
    if (submitButton) submitButton.disabled = true;
    try {
      await request("/api/v1/admin/provider-subscription-plans", { method: "POST", body: { code: form.get("code"), name: form.get("name"), description: form.get("description"), amount_ngn: Number(form.get("amount_ngn")), listing_limit: Number(form.get("listing_limit")), flutterwave_plan_id: form.get("flutterwave_plan_id") ? Number(form.get("flutterwave_plan_id")) : null, features: { verified_badge: true, public_contact: true } } });
      setText("providerPlanStatus", "Subscription plan saved. Providers can now refresh their Subscription page.");
      formElement.reset();
      await loadProviderPlans(true);
    } catch (error) {
      setText("providerPlanStatus", error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function loadProviderPlans(verify = false) {
    setText("providerPlansStatus", verify ? "Checking Flutterwave plan prices..." : "Loading subscription plans...");
    try {
      const data = await request(`/api/v1/admin/provider-subscription-plans${verify ? "?verify=true" : ""}`);
      state.providerPlans = data.items || [];
      renderProviderPlans();
      setText("providerPlansStatus", `${state.providerPlans.filter((plan) => plan.is_active).length} active subscription plan${state.providerPlans.filter((plan) => plan.is_active).length === 1 ? "" : "s"}.${verify ? " Flutterwave prices checked." : " Checking Flutterwave prices in the background."}`);
    } catch (error) {
      setText("providerPlansStatus", error.message);
    }
  }

  function renderProviderPlans() {
    const table = $("providerPlansTable");
    if (!table) return;
    table.innerHTML = `<thead><tr><th>Plan</th><th>Monthly price</th><th>Yearly price</th><th>Posts total</th><th>Flutterwave</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.providerPlans.map((plan) => `<tr>
      <td><strong>${escapeHtml(plan.name)}</strong><br><span class="muted">${escapeHtml(plan.code)}</span></td>
      <td>NGN ${Number(plan.amount_ngn || 0).toLocaleString()} / ${escapeHtml(plan.billing_interval || "month")}${plan.is_active && plan.gateway_plan_status === "unavailable" ? '<br><span class="muted">Flutterwave price could not be checked</span>' : plan.is_active && plan.gateway_price_matches === false && plan.gateway_plan_amount_ngn != null ? `<br><strong>Flutterwave: NGN ${Number(plan.gateway_plan_amount_ngn).toLocaleString()} — mismatch</strong>` : ""}</td>
      <td>${plan.yearly_amount_ngn!=null?`NGN ${Number(plan.yearly_amount_ngn).toLocaleString()} / year<br><span class="muted">Save ${Number(plan.yearly_discount_percent)}% (${Number(plan.yearly_savings_ngn).toLocaleString()}) - prepaid</span>`:"Available after the pricing update"}</td><td>${Number(plan.listing_limit || 0).toLocaleString()}<ul>${(window.ProviderTierBenefits?.lines(plan)||[]).map(line=>`<li>${escapeHtml(line)}</li>`).join('')}</ul></td>
      <td>${escapeHtml(String(plan.flutterwave_plan_id || "Not configured"))}</td>
      <td><span class="status-pill ${plan.is_active ? "active" : "inactive"}">${plan.is_active ? "ACTIVE" : "REMOVED"}</span></td>
      <td>${plan.is_active ? `<label>New monthly price NGN <input type="number" min="1" step="1" value="${Number(plan.amount_ngn || 0)}" data-new-price="${plan.id}" style="max-width:7rem" /></label><label>Existing Flutterwave plan ID (optional)<input type="number" min="1" step="1" data-link-plan="${plan.id}" placeholder="Plan ID" style="max-width:8rem" /></label><button type="button" data-change-price="${plan.id}">Save price / link plan</button><button type="button" class="danger-button" data-deactivate-plan="${plan.id}">Remove from sale</button>` : "-"}</td>
    </tr>`).join("") || `<tr><td colspan="7">No subscription plans configured.</td></tr>`}</tbody>`;
    table.querySelectorAll("[data-deactivate-plan]").forEach((button) => button.addEventListener("click", () => deactivateProviderPlan(button.dataset.deactivatePlan)));
    table.querySelectorAll("[data-change-price]").forEach((button) => button.addEventListener("click", () => changeProviderPlanPrice(button.dataset.changePrice)));
  }

  async function changeProviderPlanPrice(planID) {
    const input = document.querySelector(`[data-new-price="${planID}"]`);
    const amount = Number(input?.value);
    const planIDText = document.querySelector(`[data-link-plan="${planID}"]`)?.value.trim() || "";
    const gatewayID = planIDText ? Number(planIDText) : null;
    if (gatewayID !== null && (!Number.isSafeInteger(gatewayID) || gatewayID < 1)) return setText("providerPlansStatus", "Enter a valid positive Flutterwave plan ID.");
    if (!Number.isSafeInteger(amount) || amount < 1) return setText("providerPlansStatus", "Enter a positive whole-naira monthly price.");
    if (!confirm(`Set the monthly price to NGN ${amount.toLocaleString()} for future provider signups? ${gatewayID ? `Link existing Flutterwave plan ${gatewayID} after verifying its price and monthly interval.` : "The portal will reuse a matching Flutterwave plan or create a new one."} Existing subscriptions keep their current price.`)) return;
    const button = document.querySelector(`[data-change-price="${planID}"]`);
    button.disabled = true;
    setText("providerPlansStatus", "Matching the monthly price with Flutterwave...");
    try {
      const result = await request(`/api/v1/admin/provider-subscription-plans/${planID}/price`, { method: "POST", body: { amount_ngn: amount, ...(gatewayID ? {flutterwave_plan_id:gatewayID} : {}) } });
      await loadProviderPlans(true);
      setText("providerPlansStatus", `Price saved at NGN ${amount.toLocaleString()}/month; Flutterwave plan ${result.flutterwave_plan_id} is linked for future subscriptions. Existing subscriptions were not repriced.`);
    } catch (error) {
      setText("providerPlansStatus", error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function deactivateProviderPlan(planID) {
    if (!confirm("Remove this plan from sale? Existing paid subscriptions will remain valid until their paid period ends.")) return;
    setText("providerPlansStatus", "Removing subscription plan from sale...");
    try {
      await request(`/api/v1/admin/provider-subscription-plans/${planID}`, { method: "DELETE" });
      await loadProviderPlans(true);
    } catch (error) {
      setText("providerPlansStatus", error.message);
    }
  }

  $("reloadProvidersButton")?.addEventListener("click", () => loadProviders({ reset: true }));
  $("reloadProviderListingsButton")?.addEventListener("click", () => loadProviderListings({ reset: true }));
  $("loadMoreProvidersButton")?.addEventListener("click", () => loadProviders());
  $("loadMoreProviderListingsButton")?.addEventListener("click", () => loadProviderListings());
  $("providerSearch")?.addEventListener("input", debounce(() => loadProviders({ reset: true }), 300));
  $("providerVerificationStatus")?.addEventListener("change", () => loadProviders({ reset: true }));
  $("providerListingSearch")?.addEventListener("input", debounce(() => loadProviderListings({ reset: true }), 300));
  $("providerListingModerationStatus")?.addEventListener("change", () => loadProviderListings({ reset: true }));
  $("providerPlanForm")?.addEventListener("submit", saveProviderPlan);
  $("providerAccessMode")?.addEventListener("change", () => { $("providerPaidStartAt").disabled = $("providerAccessMode").value !== "paid"; });
  $("reloadProviderPlansButton")?.addEventListener("click", () => loadProviderPlans(true));
  $("reloadGatewaySubscriptionsButton")?.addEventListener("click", () => loadGatewaySubscriptions(true));
  $("reloadMerchantProductsButton")?.addEventListener("click", () => loadMerchantProducts({ reset: true }));
  $("loadMoreMerchantProductsButton")?.addEventListener("click", () => loadMerchantProducts());
  $("merchantProductSearch")?.addEventListener("input", debounce(() => loadMerchantProducts({ reset: true }), 300));
  $("merchantProductStatus")?.addEventListener("change", () => loadMerchantProducts({ reset: true }));
  $("reloadMerchantFulfillmentsButton")?.addEventListener("click", () => loadMerchantFulfillments({ reset: true }));
  $("loadMoreMerchantFulfillmentsButton")?.addEventListener("click", () => loadMerchantFulfillments());
  $("merchantFulfillmentSearch")?.addEventListener("input", debounce(() => loadMerchantFulfillments({ reset: true }), 300));
  $("merchantFulfillmentRoute")?.addEventListener("change", () => loadMerchantFulfillments({ reset: true }));
  $("merchantFulfillmentStatusFilter")?.addEventListener("input", debounce(() => loadMerchantFulfillments({ reset: true }), 300));
  configureRoleUi();
  window.watchCatalogChanges({
    url: `${state.apiUrl}/api/v1/catalog/version`,
    enabled: () => Boolean(state.token && ["service-moderation","product-moderation"].includes(state.activeTab) && ["super_admin", "catalog_admin"].includes(state.role)),
    refresh: async () => {
      if (document.querySelector("#editListingDialog[open], #editProductDialog[open]") || document.querySelector("[data-product-status]:disabled")) return false;
      const results = await Promise.all([state.activeTab === "product-moderation" ? loadMerchantProducts({ reset: true }) : loadProviderListings({ reset: true })]);
      return results.every(result => result !== false);
    }
  });
})();
