(() => {
    const oldAllowed = allowedTabsForRole;
    allowedTabsForRole = (role = state.role) => ['super_admin', 'catalog_admin'].includes(role) ? [...oldAllowed(role), 'community'] : oldAllowed(role);
    const oldLoad = loadTabData;
    loadTabData = (tab, options = {}) => tab === 'community' ? loadReports() : oldLoad(tab, options);
    let generation = 0;
    async function loadReports() {
        const token = state.token, seq = ++generation;
        const status = $('communityAdminStatus');
        status.textContent = 'Loading reports…';
        try {
            const data = await request('/api/v1/admin/community/reports');
            if (token !== state.token || seq !== generation)
                return;
            const root = $('communityAdminRows');
            root.replaceChildren();
            status.textContent = `${data.items.length} recent reports.`;
            for (const report of data.items) {
                const article = document.createElement('article');
                article.className = 'panel';
                const heading = document.createElement('h3');
                heading.textContent = `${report.reporter} · ${report.state}`;
                const reason = document.createElement('p');
                reason.textContent = report.reason;
                article.append(heading, reason);
                const view = document.createElement('button');
                view.textContent = 'Review reported chat';
                view.onclick = async () => { view.disabled = true; try {
                    const messages = await request(`/api/v1/admin/community/reports/${report.id}/messages`);
                    if (token !== state.token)
                        return;
                    const history = document.createElement('div');
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
        catch (e) {
            if (token === state.token && seq === generation)
                status.textContent = e.message;
        }
    }
    $('communityAdminRefresh').onclick = () => void loadReports();
})();
