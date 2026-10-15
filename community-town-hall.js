(function (root) {
    'use strict';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function mount({ element, request, getActor, openChat, roomId = '' }) {
        const actor = getActor();
        let room = null, mine = false, busy = false, cursor = '', items = [], createReference = null,offerReference=null;
        const live = () => actor === getActor() && element.isConnected;
        const originalRequest = request;
        request = (path, options = {}) => { if (path === '/chat/town-hall' && options.method === 'POST') {
            const payload = JSON.parse(options.body), fingerprint = JSON.stringify(payload);
            if (createReference?.fingerprint !== fingerprint)
                createReference = { fingerprint, id: crypto.randomUUID() };
            options = { ...options, body: JSON.stringify({ ...payload, client_request_id: createReference.id }) };
        }if(path.endsWith('/offers')&&options.method==='POST'){const payload=JSON.parse(options.body),fingerprint=JSON.stringify(payload);if(offerReference?.fingerprint!==fingerprint)offerReference={fingerprint,id:crypto.randomUUID()};options={...options,body:JSON.stringify({...payload,client_message_id:offerReference.id})}} return originalRequest(path, options); };
        const button = (label, attr) => `<button type="button" ${attr}>${esc(label)}</button>`;
        const run = fn => event => { event?.preventDefault(); void act(fn, event?.currentTarget); };
        async function act(fn, trigger) { if (busy)
            return; busy = true;
            const button = trigger?.tagName === 'BUTTON' ? trigger : trigger?.querySelector('button[type="submit"]');
            const wasDisabled = button?.disabled;
            if (button) { button.disabled = true; button.setAttribute('aria-busy','true'); }
            try {
            await fn();
        }
        catch (e) {
            if (live()) {
                const target = element.querySelector('[data-hall-error]');
                if (target)
                    target.textContent = e.message;
            }
        }
        finally {
            busy = false;
            if (button) { button.disabled = wasDisabled; button.removeAttribute('aria-busy'); }
        } }
        async function list(older = '') { const data = await request(`/chat/town-hall?limit=25&mine=${mine}${older ? '&cursor=' + encodeURIComponent(older) : ''}`); if (!live())
            return; items = older ? [...items, ...data.items.filter(item => !items.some(old => old.id === item.id))] : data.items; cursor = data.next_cursor || ''; room = null; render(); }
        async function detail(id) { const data = await request(`/chat/town-hall/${id}`); if (!live())
            return; room = data; render(); }
        async function change(provider, action) { await request(`/chat/town-hall/${room.id}/providers/${provider}`, { method: 'POST', body: JSON.stringify({ action }) }); await detail(room.id); }
        function render() {
            element.innerHTML = `<p data-hall-error role="status"></p>`;
            if (!room) {
                element.insertAdjacentHTML('beforeend', `<header class="hall-hero"><span class="hall-live"><i></i> TOWN HALL</span><h2>Ask. Meet. Make a deal.</h2><p>Your request starts the conversation. Hear from providers, compare offers and choose who to talk to privately.</p><div class="hall-stats"><span>${items.filter(i=>i.state==='open').length} open on this page</span><span>10 provider places per request</span></div></header><form class="hall-create" data-hall-create><label for="hall-request-message">What are you looking for?</label><textarea id="hall-request-message" name="message" rows="3" minlength="3" maxlength="2000" required placeholder="I need 50 bags of rice for an occasion in Abuja. My budget is ₦48,500 per bag. Who can help?"></textarea><div class="community-row"><small>Write it in your own words.</small><button type="submit">Start a conversation ↗</button></div></form><div class="community-row hall-filter">${button(mine ? 'All open requests' : 'My requests', 'data-hall-mine')}${button('Refresh', 'data-hall-refresh')}</div><div class="hall-feed">${items.map(item => `<article class="hall-request"><div class="hall-request-top"><span class="hall-avatar" aria-hidden="true">${esc((item.buyer_name||item.title).slice(0,1).toUpperCase())}</span><div><strong>${esc(item.buyer_name||'Looking for providers')}</strong><small>${esc(new Date(item.created_at).toLocaleString())}</small></div><span class="hall-seat">${item.seats}/10</span></div><p class="hall-request-message">${esc(item.description)}</p>${!item.message_only?`<p class="community-note">${esc(item.location)} · ${esc(item.quantity)} ${esc(item.unit)} · NGN ${esc(item.target_unit_price)} per unit</p>`:''}<footer><span>${item.offers.length} offer${item.offers.length===1?'':'s'} · ${item.seats>=10?'Room full':'Places available'}</span>${button('Enter conversation →', `data-hall-detail="${item.id}"`)}</footer></article>`).join('') || '<div class="hall-empty"><h3>Be the first to start something.</h3><p>Post what you need. Providers can ask to join your conversation.</p></div>'}</div>${cursor ? button('More conversations', 'data-hall-more') : ''}`);
                element.querySelector('[data-hall-mine]').onclick = run(async () => { mine = !mine; await list(); });
                element.querySelector('[data-hall-refresh]').onclick = run(() => list());
                element.querySelector('[data-hall-more]')?.addEventListener('click', run(() => list(cursor)));
                element.querySelectorAll('[data-hall-detail]').forEach(b => b.onclick = run(() => detail(b.dataset.hallDetail)));
                element.querySelector('form').onsubmit = e => { e.preventDefault(); const form = e.currentTarget; void act(async () => { const data = await request('/chat/town-hall', { method: 'POST', body: JSON.stringify({message:form.elements.message.value.trim()}) }); await detail(data.id); },e.submitter||form); };
                return;
            }
            element.insertAdjacentHTML('beforeend', `<div class="community-row">${button('← Town Hall', 'data-hall-back')}${button('Refresh', 'data-hall-refresh')}</div><article class="hall-request hall-room"><span class="hall-live">${room.state==='closed'?'CLOSED CONVERSATION':'OPEN CONVERSATION'}</span><p class="hall-request-message">${esc(room.description)}</p>${!room.message_only?`<p>${esc(room.location)} · ${esc(room.quantity)} ${esc(room.unit)} · Target NGN ${esc(room.target_unit_price)} per ${esc(room.unit)}</p>`:''}<p>${room.state === 'closed' ? 'Closed' : `${room.seats}/10 provider places occupied`}</p>${room.admitted || room.is_owner ? button(room.state === 'closed' ? 'View chat record' : 'Open bargaining chat →', 'data-hall-chat') : room.state === 'open' ? room.seats >= 10 ? '<p>Full. A place opens when the buyer removes a provider.</p>' : room.application_state === 'pending' ? '<p>Waiting for buyer approval.</p>' : button('Ask to join →', 'data-hall-apply') : ''}</article>
    ${room.is_owner && room.state === 'open' ? `<div class="community-card"><h3>Provider requests</h3>${(room.applications || []).map(a => `<p>${esc(a.name)} · ${esc(a.state)}</p><div class="community-row">${a.state === 'pending' ? button('Approve', `data-hall-member="${a.provider_id}" data-action="approve"`) + button('Decline', `data-hall-member="${a.provider_id}" data-action="decline"`) : a.state === 'admitted' ? button('Remove', `data-hall-member="${a.provider_id}" data-action="remove"`) : ''}</div>`).join('')}${button('End this request', 'data-hall-close')}</div>` : ''}
    <div class="community-card"><h3>Offers on the table</h3><p>Public previews. Join with buyer approval to read the bargaining chat.</p>${room.offers.map(o => `<article class="hall-offer"><h3>${esc(o.provider_name)}</h3><strong>NGN ${esc(o.unit_price)}${room.message_only?'':` per ${esc(room.unit)} · Total NGN ${(Number(o.unit_price) * Number(room.quantity)).toLocaleString()}`}</strong><p>${esc(o.terms)}</p>${room.is_owner && room.state === 'open' ? button('Continue privately →', `data-hall-choose="${o.id}"`) : ''}</article>`).join('')||'<p>No offers yet. The conversation starts when providers join.</p>'}</div>
    ${room.admitted && !room.is_owner && room.state === 'open' ? `<form class="community-card" data-hall-offer><h3>Make or update an offer</h3><label>${room.message_only?'Offer amount, NGN':'Price per unit, NGN'}<input name="unit_price" type="number" min="0.01" step="0.01" required/></label><label>Public offer terms<textarea name="terms" maxlength="1000" rows="3"></textarea></label><button type="submit">Publish offer</button><p>An active paid plan is required to send offers and messages.</p></form>` : ''}`);
            element.querySelector('[data-hall-back]').onclick = run(() => list());
            element.querySelector('[data-hall-refresh]').onclick = run(() => detail(room.id));
            element.querySelector('[data-hall-chat]')?.addEventListener('click', run(() => openChat(room.id)));
            element.querySelector('[data-hall-apply]')?.addEventListener('click', run(async () => { await request(`/chat/town-hall/${room.id}/apply`, { method: 'POST' }); await detail(room.id); }));
            element.querySelectorAll('[data-hall-member]').forEach(b => b.onclick = run(() => change(b.dataset.hallMember, b.dataset.action)));
            element.querySelector('[data-hall-close]')?.addEventListener('click', () => { if (confirm('End this request? It disappears publicly; you retain the record and private chats stay open.'))
                void act(async () => { await request(`/chat/town-hall/${room.id}/close`, { method: 'POST' }); await detail(room.id); }); });
            element.querySelectorAll('[data-hall-choose]').forEach(b => b.onclick = () => { if (confirm('Open a private chat with this provider and close the Town Hall request?'))
                void act(async () => { const data = await request(`/chat/town-hall/${room.id}/choose`, { method: 'POST', body: JSON.stringify({ offer_id: b.dataset.hallChoose, close_room: true }) }); await openChat(data.id); }); });
            element.querySelector('[data-hall-offer]')?.addEventListener('submit', e => { e.preventDefault(); const form = e.currentTarget; void act(async () => { await request(`/chat/town-hall/${room.id}/offers`, { method: 'POST', body: JSON.stringify({ unit_price: Number(form.elements.unit_price.value), terms: form.elements.terms.value }) }); await detail(room.id); }); });
        }
        element.innerHTML = '<p>Loading Town Hall…</p>';
        try {
            if (roomId)
                await detail(roomId);
            else
                await list();
        }
        catch (e) {
            if (live())
                element.textContent = e.message;
        }
    }
    root.CommunityTownHall = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
