(function (root) {
    'use strict';
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function mount({ element, request, getActor, openChat }) {
        const actor = getActor();
        let photos = [], retry = null, busy = false, cursor = '', items = [];
        element.innerHTML = '<p>Loading updates…</p>';
        const current = () => actor === getActor() && element.isConnected;
        try {
            const [feed, profile, friendData] = await Promise.all([request('/chat/statuses?limit=25'), request('/chat/profile'), request('/chat/friends?limit=100')]);
            if (!current())
                return;
            items = feed.items || [];
            cursor = feed.next_cursor || '';
            const friends = friendData.items.filter(f => f.state === 'accepted');
            element.innerHTML = `<form class="community-card community-status-form"><h3>Share an update</h3><p>Visible to your chosen friends for 24 hours.</p><textarea name="message" maxlength="2000" rows="3" aria-label="Status update" placeholder="What would you like to share?"></textarea><label>Audience<select name="audience"><option value="friends">Friends</option><option value="selected">Selected friends</option></select></label><fieldset class="community-status-friends" hidden><legend>Choose friends</legend>${friends.map(f => `<label><input type="checkbox" name="recipient" value="${esc(f.user_id)}"/> ${esc(f.name)} · @${esc(f.handle)}</label>`).join('')}</fieldset><div class="community-status-photos"></div><label>Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Status photos"/></label><button type="submit">Post update</button></form><div class="community-card"><h3>Provider promotions</h3><p>Allow labelled paid-provider promotions through accepted friends, up to three connections away. This is separate from username discovery.</p><label><input class="community-status-promotions" type="checkbox" ${profile.connection_promotions ? 'checked' : ''}/> Allow connection-based promotions</label></div><p class="community-status-error" role="status"></p><div class="community-status-feed"></div><button type="button" class="community-status-refresh">Refresh updates</button>`;
            const form = element.querySelector('form'), error = element.querySelector('.community-status-error');
            const act = async (fn) => { if (busy)
                return; busy = true; error.textContent = ''; form.querySelectorAll('button,input,textarea,select').forEach(n => n.disabled = true); try {
                await fn();
            }
            catch (e) {
                if (current())
                    error.textContent = e.message;
            }
            finally {
                busy = false;
                if (current())
                    form.querySelectorAll('button,input,textarea,select').forEach(n => n.disabled = false);
            } };
            function renderPhotos() { const target = element.querySelector('.community-status-photos'); target.innerHTML = photos.map((p, i) => `<button type="button" data-status-remove="${i}" aria-label="Remove status photo"><img src="${esc(p.uri)}" alt="Attached status photo" width="72" height="72"/></button>`).join(''); target.querySelectorAll('[data-status-remove]').forEach(b => b.onclick = () => { if (busy)
                return; const index = Number(b.dataset.statusRemove); URL.revokeObjectURL(photos[index].uri); photos.splice(index, 1); renderPhotos(); }); }
            function renderFeed() { const target = element.querySelector('.community-status-feed'); target.innerHTML = items.filter(item => Date.parse(item.expires_at) > Date.now()).map(item => `<article class="community-card"><h3>${esc(item.name)} · @${esc(item.handle)}</h3><p>${esc(item.body)}</p>${(item.media_urls || []).filter(url => /^https:\/\//.test(url)).map(url => `<button type="button" data-chat-photo="${esc(url)}" aria-label="View status photo"><img src="${esc(url)}" alt="Status photo" loading="lazy" width="150" height="150"/></button>`).join('')}<p>Expires ${esc(new Date(item.expires_at).toLocaleTimeString())}</p>${item.is_mine ? `<button type="button" data-status-delete="${item.id}">Delete update</button>` : ''}</article>`).join('') || '<p>Updates shared with you appear here.</p>'; if (cursor)
                target.insertAdjacentHTML('beforeend', '<button type="button" data-status-more>Load more</button>'); target.querySelector('[data-status-more]')?.addEventListener('click', () => void act(() => refresh(cursor))); target.querySelectorAll('[data-status-delete]').forEach(b => b.onclick = () => { if (confirm('Delete this update?'))
                void act(async () => { await request(`/chat/statuses/${b.dataset.statusDelete}`, { method: 'DELETE' }); await refresh(); }); }); }
            async function refresh(older = '') { const data = await request('/chat/statuses?limit=25' + (older ? '&cursor=' + encodeURIComponent(older) : '')); if (!current())
                return; items = older ? [...items, ...data.items.filter(item => !items.some(old => old.id === item.id))] : data.items; cursor = data.next_cursor || ''; renderFeed(); }
            form.elements.audience.onchange = () => { element.querySelector('fieldset').hidden = form.elements.audience.value !== 'selected'; };
            form.querySelector('input[type=file]').onchange = e => void act(async () => { for (const file of Array.from(e.target.files || [])) {
                if (photos.length >= 4)
                    throw Error('Attach up to four photos.');
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
                    throw Error('Choose JPG, PNG or WebP photos no larger than 5 MB.');
                const data = await request('/marketplace/chat-images/presign', { method: 'POST', body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size }) });
                const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
                let result;
                try {
                    result = await fetch(data.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file, signal: controller.signal });
                }
                finally {
                    clearTimeout(timer);
                }
                if (!result.ok)
                    throw Error('Photo upload failed.');
                if (!current())
                    return;
                photos.push({ key: data.key, uri: URL.createObjectURL(file) });
            } renderPhotos(); e.target.value = ''; });
            form.onsubmit = e => { e.preventDefault(); void act(async () => { const payload = { message: form.elements.message.value.trim(), media_keys: photos.map(p => p.key), audience: form.elements.audience.value, recipients: form.elements.audience.value === 'selected' ? Array.from(form.querySelectorAll('input[name=recipient]:checked')).map(n => n.value) : [] }; if (!payload.message && !photos.length)
                throw Error('Write an update or attach a photo.'); const fingerprint = JSON.stringify(payload); if (retry?.fingerprint !== fingerprint)
                retry = { fingerprint, id: crypto.randomUUID() }; await request('/chat/statuses', { method: 'POST', body: JSON.stringify({ ...payload, client_message_id: retry.id }) }); if (!current())
                return; form.elements.message.value = ''; photos.forEach(p => URL.revokeObjectURL(p.uri)); photos = []; retry = null; renderPhotos(); await refresh(); }); };
            const ads = document.createElement('section');
            ads.className = 'community-promotions';
            element.append(ads);
            const adRefs = new Map();
            async function loadAds() { if (!element.querySelector('.community-status-promotions').checked) {
                ads.replaceChildren();
                return;
            } const data = await request('/chat/promotions?country=NG&city='+encodeURIComponent(adCity.value)+'&category='+encodeURIComponent(adCategory.value)); if (!current() || !element.querySelector('.community-status-promotions').checked)
                return; ads.innerHTML = (data.items || []).map(ad => `<article class="community-card"><p>${esc(ad.label)}</p>${root.ProviderIdentity?.render(ad.provider_identity) || ''}<h3>${esc(ad.title)}</h3>${/^https:\/\//.test(ad.image_url || '') ? `<button type="button" data-chat-photo="${esc(ad.image_url)}"><img src="${esc(ad.image_url)}" width="150" height="150" alt="Listing photo"/></button>` : ''}<button type="button" data-promotion-message="${ad.id}" data-kind="${ad.kind}">Message provider</button></article>`).join(''); ads.querySelectorAll('[data-promotion-message]').forEach(b => b.onclick = () => void act(async () => { const ad = data.items.find(item => item.id === b.dataset.promotionMessage); if (!adRefs.has(ad.id))
                adRefs.set(ad.id, crypto.randomUUID()); const conversation = await request(`/marketplace/${ad.kind === 'product' ? 'products' : 'listings'}/${ad.id}/conversations`, { method: 'POST', body: JSON.stringify({ message: `I'd like to ask about ${ad.title}`, client_message_id: adRefs.get(ad.id) }) }); await openChat(conversation.conversation_id || conversation.id); })); }
            element.querySelector('.community-status-promotions').onchange = e => { const checkbox = e.target; checkbox.disabled = true;if(!checkbox.checked)ads.replaceChildren(); void request('/chat/profile', { method: 'PATCH', body: JSON.stringify({ connection_promotions: checkbox.checked }) }).then(data=>{profile.connection_promotions=data.connection_promotions;return loadAds().catch(e=>{if(current())error.textContent=e.message});}).catch(e => { if (current()) {
                checkbox.checked = !!profile.connection_promotions;
                error.textContent = e.message;
            } }).finally(() => checkbox.disabled = false); };
            const adRefresh = document.createElement('button');
            const adCity=document.createElement('input'),adCategory=document.createElement('input');adCity.placeholder='City (optional)';adCity.setAttribute('aria-label','Promotion city');adCategory.placeholder='Category (optional)';adCategory.setAttribute('aria-label','Promotion category');adCity.maxLength=100;adCategory.maxLength=100;element.append(adCity,adCategory);
            adRefresh.type = 'button';
            adRefresh.textContent = 'Refresh provider promotions';
            adRefresh.onclick = () => void act(loadAds);
            element.append(adRefresh);
            if (profile.connection_promotions)
                void loadAds().catch(() => { });
            element.querySelector('.community-status-refresh').onclick = () => void act(() => refresh());
            renderFeed();
        }
        catch (e) {
            if (current())
                element.textContent = e.message;
        }
        return () => photos.forEach(p => URL.revokeObjectURL(p.uri));
    }
    root.CommunityUpdates = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
