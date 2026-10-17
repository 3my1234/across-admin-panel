/* Private, role-filtered operational reporting. No financial data is persisted. */
(() => {
  let generation = 0, renderedActor = "", renderedSnapshot = "";
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const count = value => number(value).toLocaleString();
  const money = value => new Intl.NumberFormat('en-NG', {style:'currency',currency:'NGN'}).format(number(value));
  const date = value => new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function card(title, value, detail, symbol) {
    return `<article class="analytics-kpi"><span class="analytics-symbol" aria-hidden="true">${symbol}</span><div><span>${title}</span><strong>${value}</strong><small>${detail}</small></div></article>`;
  }
  async function load() {
    const token=state.token, seq=++generation, isSuper=state.role==='super_admin';
    const actor=token+':'+state.role, sameActor=renderedActor===actor;
    const button=$('reloadAnalyticsButton');button.disabled=true;
    setText('analyticsSummary','Loading the last 30 days…');
    // Clear money from the previous actor immediately, including during an error.
    if(!sameActor){for(const id of ['analyticsStats','salesChart','analyticsIssues','analyticsDaily']) $(id).replaceChildren();renderedActor=actor;renderedSnapshot='';}
    try {
      const data=await request('/api/v1/admin/analytics/overview',{timeoutMs:8000,retry:false});
      if(token!==state.token||actor!==state.token+':'+state.role||seq!==generation)return;
      const daily=Array.isArray(data.daily)?data.daily:[], receipts=number(data.receipts), gross=number(data.gross_receipts);
      setText('analyticsSummary',`${data.from} – ${data.through} · Last 30 days · Nigeria time · NGN subscriptions only`);
      const snapshot=JSON.stringify(data);if(sameActor&&snapshot===renderedSnapshot)return;renderedSnapshot=snapshot;
      $('analyticsStats').innerHTML=(isSuper?card('Gross subscription receipts',money(gross),'Verified successful payments, before refunds and fees','₦'):'')+
        card('Successful subscription payments',count(receipts),'Payments received during this period','✓')+
        (isSuper?card('Average subscription payment',money(receipts?gross/receipts:0),'Gross receipts ÷ successful payments','↗'):card('Unresolved complaints',count(data.unresolved_complaints),'Created during this period','!'));
      const max=Math.max(1,...daily.map(d=>number(isSuper?d.gross_receipts:d.receipts)));
      $('salesChart').innerHTML=`<h3>${isSuper?'Subscription receipts':'Subscription payments'} by day</h3><p class="muted">${isSuper?'Gross verified receipts · NGN':'Successful payments'} · Last 30 days</p><div class="analytics-bars" role="img" aria-label="Daily subscription totals. Exact values are available in the daily breakdown below.">${daily.map(d=>{const value=number(isSuper?d.gross_receipts:d.receipts);return `<div class="analytics-bar-column" title="${escape(date(d.date))}: ${escape(isSuper?money(value):count(value))}"><span class="analytics-bar" style="height:${Math.max(0,value/max*100)}%"></span><small>${escape(date(d.date))}</small></div>`;}).join('')}</div>${receipts?'':'<p class="muted">No successful NGN subscription payments in this period.</p>'}`;
      $('analyticsIssues').innerHTML=`<h3>Complaints & payment exceptions</h3>`+card('Complaints logged',count(data.complaints),'Created during this period','!')+card('Unresolved complaints',count(data.unresolved_complaints),'Still awaiting resolution','…')+(isSuper?card('Recorded complaint refund amounts',money(data.recorded_refunds),'Resolved complaints; not proof of a bank refund','↶'):'')+card('Payments flagged for review',count(data.flagged_receipts),'Refund or chargeback flags on these receipts','!')+'<p class="muted analytics-note">Gross receipts are not net profit. Processor fees, expenses and actual refunds must be reconciled separately. Product and service deals are arranged directly with providers.</p>';
      $('analyticsDaily').innerHTML=`<h3>Daily subscription breakdown</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Successful payments</th>${isSuper?'<th>Gross receipts</th><th>Average payment</th>':''}</tr></thead><tbody>${[...daily].reverse().map(d=>`<tr><td>${escape(date(d.date))}</td><td>${count(d.receipts)}</td>${isSuper?`<td>${money(d.gross_receipts)}</td><td>${money(number(d.receipts)?number(d.gross_receipts)/number(d.receipts):0)}</td>`:''}</tr>`).join('')}</tbody><tfoot><tr><th>Total</th><td>${count(receipts)}</td>${isSuper?`<td>${money(gross)}</td><td>${money(receipts?gross/receipts:0)}</td>`:''}</tr></tfoot></table></div>`;
    } catch(error) {
      if(token===state.token&&seq===generation)setText('analyticsSummary',`${error.message} Use Refresh to try again.`);
    } finally {
      if(seq===generation)button.disabled=false;
    }
  }
  window.AtlAdminAnalytics={load};
})();
