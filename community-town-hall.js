(function (root) {
    'use strict';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function mount({ element, request, getActor, openChat, roomId = '' }) {
        const actor = getActor();
        let room = null, mine = false, busy = false, cursor = '', items = [], createReference = null;
        const live = () => actor === getActor() && element.isConnected;
        const originalRequest = request;
        request = (path, options = {}) => { if (path === '/chat/town-hall' && options.method === 'POST') {
            const payload = JSON.parse(options.body), fingerprint = JSON.stringify(payload);
            if (createReference?.fingerprint !== fingerprint)
                createReference = { fingerprint, id: crypto.randomUUID() };
            options = { ...options, body: JSON.stringify({ ...payload, client_request_id: createReference.id }) };
        } return originalRequest(path, options); };
        const button = (label, attr) => `<button type="button" ${attr}>${esc(label)}</button>`;
        async function act(fn) { if (busy)
            return; busy = true; element.querySelectorAll('button').forEach(b => b.disabled = true); try {
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
            if (live())
                element.querySelectorAll('button').forEach(b => b.disabled = false);
        } }
        async function list(older = '') { const data = await request(`/chat/town-hall?limit=25&mine=${mine}${older ? '&cursor=' + encodeURIComponent(older) : ''}`); if (!live())
            return; items = older ? [...items, ...data.items.filter(item => !items.some(old => old.id === item.id))] : data.items; cursor = data.next_cursor || ''; room = null; render(); }
        async function detail(id) { const data = await request(`/chat/town-hall/${id}`); if (!live())
            return; room = data; render(); }
        async function change(provider, action) { await request(`/chat/town-hall/${room.id}/providers/${provider}`, { method: 'POST', body: JSON.stringify({ action }) }); await detail(room.id); }
        function render() {
            element.innerHTML = `<p data-hall-error role="status"></p>`;
            if (!room) {
                element.insertAdjacentHTML('beforeend', `<div class="community-row">${button(mine ? 'Browse requests' : 'My requests', 'data-hall-mine')}${button('Refresh', 'data-hall-refresh')}</div><details class="community-card"><summary>Create a request</summary><form data-hall-create>${[['title', 'Request title'], ['description', 'Describe what you need'], ['location', 'Location'], ['quantity', 'Quantity'], ['unit', 'Unit, e.g. bag'], ['target_unit_price', 'Target price per unit, NGN']].map(([key, label]) => `<label>${label}<input name="${key}" type="${key === 'quantity' || key === 'target_unit_price' ? 'number' : 'text'}" ${key === 'quantity' || key === 'target_unit_price' ? 'min="0.01" step="0.01"' : ''} required maxlength="${key === 'description' ? 2000 : 160}"/></label>`).join('')}<button type="submit">Publish request</button></form></details><p class="community-note">Verified providers with active paid plans may request entry. Buyers approve up to ten providers.</p>${items.map(item => `<article class="community-card"><h3>${esc(item.title)}</h3><p>${esc(item.location)} · ${esc(item.quantity)} ${esc(item.unit)} · NGN ${esc(item.target_unit_price)} per unit</p><p>${item.state === 'closed' ? 'Closed' : `${item.seats}/10 providers · ${item.offers.length} offers`}</p>${button('View request', `data-hall-detail="${item.id}"`)}</article>`).join('') || '<p>No requests yet.</p>'}${cursor ? button('Load more', 'data-hall-more') : ''}`);
                element.querySelector('[data-hall-mine]').onclick = () => void act(async () => { mine = !mine; await list(); });
                element.querySelector('[data-hall-refresh]').onclick = () => void act(() => list());
                element.querySelector('[data-hall-more]')?.addEventListener('click', () => void act(() => list(cursor)));
                element.querySelectorAll('[data-hall-detail]').forEach(b => b.onclick = () => void act(() => detail(b.dataset.hallDetail)));
                element.querySelector('form').onsubmit = e => { e.preventDefault(); const form = e.currentTarget; void act(async () => { const payload = Object.fromEntries(new FormData(form)); payload.quantity = Number(payload.quantity); payload.target_unit_price = Number(payload.target_unit_price); const data = await request('/chat/town-hall', { method: 'POST', body: JSON.stringify(payload) }); await detail(data.id); }); };
                return;
            }
            element.insertAdjacentHTML('beforeend', `<div class="community-row">${button('Back to requests', 'data-hall-back')}${button('Refresh', 'data-hall-refresh')}</div><article class="community-card"><h3>${esc(room.title)}</h3><p>${esc(room.description)}</p><p>${esc(room.location)} · ${esc(room.quantity)} ${esc(room.unit)} · Target NGN ${esc(room.target_unit_price)} per ${esc(room.unit)}</p><p>${room.state === 'closed' ? 'Closed' : `${room.seats}/10 provider places occupied`}</p>${room.admitted || room.is_owner ? button(room.state === 'closed' ? 'View chat record' : 'Open bargaining chat', 'data-hall-chat') : room.state === 'open' ? room.seats >= 10 ? '<p>Full. A place opens when the buyer removes a provider.</p>' : room.application_state === 'pending' ? '<p>Waiting for buyer approval.</p>' : button('Request to join', 'data-hall-apply') : ''}</article>
    ${room.is_owner && room.state === 'open' ? `<div class="community-card"><h3>Provider requests</h3>${(room.applications || []).map(a => `<p>${esc(a.name)} · ${esc(a.state)}</p><div class="community-row">${a.state === 'pending' ? button('Approve', `data-hall-member="${a.provider_id}" data-action="approve"`) + button('Decline', `data-hall-member="${a.provider_id}" data-action="decline"`) : a.state === 'admitted' ? button('Remove', `data-hall-member="${a.provider_id}" data-action="remove"`) : ''}</div>`).join('')}${button('End this request', 'data-hall-close')}</div>` : ''}
    <div class="community-card"><h3>Offer previews</h3><p>Offers are public previews. Bargaining messages stay inside the admitted chat.</p>${room.offers.map(o => `<article class="community-card"><h3>${esc(o.provider_name)}</h3><p>NGN ${esc(o.unit_price)} per ${esc(room.unit)} · Total NGN ${(Number(o.unit_price) * Number(room.quantity)).toLocaleString()}</p><p>${esc(o.terms)}</p>${room.is_owner && room.state === 'open' ? button('Continue privately', `data-hall-choose="${o.id}"`) : ''}</article>`).join('')}</div>
    ${room.admitted && !room.is_owner && room.state === 'open' ? '<form class="community-card" data-hall-offer><h3>Make or update an offer</h3><label>Price per unit, NGN<input name="unit_price" type="number" min="0.01" step="0.01" required/></label><label>Public offer terms<textarea name="terms" maxlength="1000" rows="3"></textarea></label><button type="submit">Publish offer</button><p>An active paid plan is required to send offers and messages.</p></form>' : ''}`);
            element.querySelector('[data-hall-back]').onclick = () => void act(() => list());
            element.querySelector('[data-hall-refresh]').onclick = () => void act(() => detail(room.id));
            element.querySelector('[data-hall-chat]')?.addEventListener('click', () => void act(() => openChat(room.id)));
            element.querySelector('[data-hall-apply]')?.addEventListener('click', () => void act(async () => { await request(`/chat/town-hall/${room.id}/apply`, { method: 'POST' }); await detail(room.id); }));
            element.querySelectorAll('[data-hall-member]').forEach(b => b.onclick = () => void act(() => change(b.dataset.hallMember, b.dataset.action)));
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
