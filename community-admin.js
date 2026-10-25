(() => {
    const oldAllowed = allowedTabsForRole;
    allowedTabsForRole = (role = state.role) => ['super_admin', 'catalog_admin','moderation_admin'].includes(role) ? [...oldAllowed(role), 'community'] : oldAllowed(role);
    const oldLoad = loadTabData;
    loadTabData = (tab, options = {}) => tab === 'community' ? loadReports() : oldLoad(tab, options);
    let generation = 0, loaded = [], loadedToken = null;
    const safeNode = (tag, text, className) => { const node=document.createElement(tag); node.textContent=text; if(className)node.className=className; return node; };
    function renderReports() {
        const root=$('communityAdminRows'); root.replaceChildren();
        if(loadedToken!==state.token)return;
        const filter=$('communityAdminFilter').value, query=$('communityAdminSearch').value.trim().toLowerCase();
        const reports=loaded.filter(r=>(filter==='all'||r.state===filter)&&`${r.reporter} ${r.reason}`.toLowerCase().includes(query));
        $('communityAdminStatus').textContent=`Showing ${reports.length} of ${loaded.length} recent reports (up to 100).`;
        if(!reports.length)root.append(safeNode('div',loaded.length?'No reports match your filters.':'No reported conversations yet. New reports will appear here for review.','report-empty'));
        const token=state.token, status=$('communityAdminStatus');
        for (const report of reports) {
            const article = document.createElement('article');
            article.className = 'report-card';
            const heading = document.createElement('h3');
            heading.textContent = report.reporter || 'Reported conversation';
            const reason = document.createElement('p');
            reason.textContent = report.reason;
            const badge=safeNode('span',report.state,'status-pill'); badge.dataset.status=report.state;
            const at=safeNode('small',new Date(report.created_at).toLocaleString(),'muted');
            const head=document.createElement('div');head.className='section-head';head.append(heading,badge);article.append(head,at,reason);
            const view = document.createElement('button');
            view.textContent = 'Review reported chat';
            view.onclick = async () => { view.disabled = true; try {
                const messages = await request(`/api/v1/admin/community/reports/${report.id}/messages`);
                if (token !== state.token)
                    return;
                const history = document.createElement('div'); history.className='report-history'; history.append(safeNode('p','Most recent 100 messages from this reported conversation.','muted'));
                for (const item of [...messages.items].reverse()) {
                    const p = document.createElement('p');
                    p.textContent = `${item.name}: ${item.body}`;
                    history.append(p);
                    for(const uri of item.media_urls || []){if(!/^https:\/\//.test(uri))continue;const link=document.createElement('a');link.href=uri;link.target='_blank';link.rel='noopener noreferrer';const image=document.createElement('img');image.src=uri;image.alt='Reported chat attachment';image.style.cssText='max-width:160px;max-height:160px;border-radius:8px';link.append(image);history.append(link);}
                }
                article.append(history);
                view.remove();
            }
            catch (e) {
                status.textContent = e.message;
                view.disabled = false;
            } };
            article.append(view);
            if (report.state === 'open') {
                const resolve = document.createElement('button');
                resolve.textContent = 'Mark resolved';
                resolve.onclick = async () => { resolve.disabled = true; try {
                    await request(`/api/v1/admin/community/reports/${report.id}/resolve`, { method: 'POST' });
                    if (token === state.token)
                        await loadReports();
                }
                catch (e) {
                    status.textContent = e.message;
                    resolve.disabled = false;
                } };
                article.append(resolve);
            }
            root.append(article);
        }
    }
    async function loadReports() {
        const token=state.token, seq=++generation, button=$('communityAdminRefresh');
        button.disabled=true;
        if(loadedToken!==token){loaded=[];loadedToken=token;$('communityAdminRows').replaceChildren();}
        $('communityAdminStatus').textContent='Loading reports...';
        try {
            const data=await request('/api/v1/admin/community/reports',{timeoutMs:8000,retry:false});
            if(token!==state.token||seq!==generation)return;
            loaded=Array.isArray(data.items)?data.items:[];loadedToken=token;renderReports();
        } catch(e) {
            if(token===state.token&&seq===generation)$('communityAdminStatus').textContent=e.message+' Use Refresh to retry.';
        } finally { if(seq===generation)button.disabled=false; }
    }
    $('communityAdminFilter').onchange=renderReports;
    $('communityAdminSearch').oninput=renderReports;
    $('communityAdminRefresh').onclick=()=>void loadReports();
})();
