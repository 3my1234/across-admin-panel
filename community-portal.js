(function (root) {
    "use strict";
    const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const validID = id => /^[a-f0-9-]{36}$/i.test(id || '');
    function create({ element, request, getActor }) {
        let actor = '', mode = 'chats', profile = null, inbox = [], friends = [], selected = null, messages = [], cursor = '', messageCursor = '', canSend = true, generation = 0, threadGeneration = 0, busy = false, photos = [], retry = null, disposeUpdates = null, hallRoomId = '';
        const etags = new Map(), readAcknowledged = new Map(), readPending = new Map(), readFlights = new Map(), cache = root.PortalChatHistory.create();
        function showRoom(open) { element.classList.toggle('community-room-open',open);document.body.classList.toggle('community-chat-open',open); }
        const live = (captured, sequence) => captured === getActor() && captured === actor && sequence === generation;
        const button = (text, attributes = '', secondary = true) => `<button type="button" class="${secondary ? 'secondary' : ''}" ${attributes}>${escape(text)}</button>`;
        function error(message) { const target = element.querySelector('.community-error'); if (target)
            target.textContent = message || ''; }
        function reset() { generation++; threadGeneration++; showRoom(false);disposeUpdates?.(); disposeUpdates = null; actor = '';mode='chats';hallRoomId=''; profile = null; inbox = []; friends = []; selected = null; messages = []; photos.forEach(p => URL.revokeObjectURL(p.uri)); photos = []; retry = null; etags.clear();readAcknowledged.clear();readPending.clear();readFlights.clear(); cache.clear(); element.replaceChildren(); delete element.dataset.communityMode; }
        function shell() { element.innerHTML = `<div class="community-tabs">${[['chats', 'Chats'], ['friends', 'Friends'], ['updates', 'Updates'], ['town-hall', 'Town Hall']].map(([key, label]) => button(label, `data-community-mode="${key}" class="${mode === key ? 'is-active' : ''}"`)).join('')}</div><p class="community-error" role="status"></p><div class="community-body"></div>`; for (const b of element.querySelectorAll('[data-community-mode]')) {
            b.classList.toggle('is-active', b.dataset.communityMode === mode);
            b.onclick = () => { threadGeneration++; selected = null; mode = b.dataset.communityMode; cursor = ''; void refresh(); };
        } }
        function renderList() {
            showRoom(false);
            disposeUpdates?.();
            disposeUpdates = null;
            shell();
            element.dataset.communityMode = mode;
            const body = element.querySelector('.community-body');
            if (mode === 'chats') {
                body.innerHTML = inbox.length ? inbox.map(item => `<article class="community-card ${item.unread_count ? 'community-unread' : ''}"><div class="community-row"><div style="flex:1">${root.ProviderIdentity?.render(item.provider_identity) || `<h3>${escape(item.title)}</h3>`}<p>${escape(item.kind === 'business' ? item.context?.title || 'Product or service enquiry' : item.kind === 'town_hall' ? 'Town Hall bargaining' : 'Private chat')}</p></div>${item.unread_count ? `<span class="community-count">${Number(item.unread_count)}</span>` : ''}${button('Open', `data-community-chat="${item.id}"`)}</div></article>`).join('') : '<p>Your conversations appear here. Find a friend or contact a provider to begin.</p>';
                element.querySelectorAll('[data-community-chat]').forEach(b => b.onclick = () => void open(inbox.find(item => item.id === b.dataset.communityChat)));
            }
            else if (mode === 'friends') {
                body.innerHTML = `<form class="community-card community-profile"><h3>Your username</h3><input aria-label="Your username" name="handle" autocomplete="off" maxlength="36" value="${escape(profile?.handle || '')}" required/><label><input name="discoverable" type="checkbox" ${profile?.discoverable ? 'checked' : ''}/> Let people find my exact username</label><div class="community-row"><button type="submit">Save username</button>${button('Invite a friend', 'data-community-invite')}</div></form><form class="community-card community-find"><h3>Find a friend</h3><input aria-label="Friend username" name="handle" maxlength="36" autocomplete="off" placeholder="Their exact username" required/><button type="submit">Send friend request</button></form>${friends.map(friend => `<article class="community-card"><h3>${escape(friend.name)}</h3><p>@${escape(friend.handle)}</p><div class="community-row">${friend.state === 'accepted' ? button('Message', `data-community-dm="${friend.user_id}"`) : friend.incoming ? button('Accept', `data-community-friend="${friend.id}" data-accept="true"`) + button('Decline', `data-community-friend="${friend.id}" data-accept="false"`) : '<span>Waiting for acceptance</span>'}</div></article>`).join('') || '<p>No friends or requests yet.</p>'}`;
                body.querySelector('.community-profile').onsubmit = e => { e.preventDefault(); const form = e.currentTarget; void act(async () => { profile = await request('/chat/profile', { method: 'PATCH', body: JSON.stringify({ handle: form.elements.handle.value, discoverable: form.elements.discoverable.checked }) }); renderList(); }); };
                body.querySelector('.community-find').onsubmit = e => { e.preventDefault(); const handle = e.currentTarget.elements.handle.value.trim().replace(/^@/, ''); void act(async () => { await request('/chat/friends', { method: 'POST', body: JSON.stringify({ handle }) }); await refresh(); }); };
                body.querySelector('[data-community-invite]').onclick = () => void act(async () => { if (!profile?.discoverable)
                    throw Error('Enable username discovery before sharing an invitation.'); const url = `https://api.atlxpres.com/api/v1/community/invite/${encodeURIComponent(profile.handle)}`; if (navigator.share)
                    await navigator.share({ title: 'Join me on Atl xpress', text: `My username is @${profile.handle}`, url });
                else {
                    await navigator.clipboard.writeText(url);
                    error('Invitation copied. Share it with your friend.');
                } });
                body.querySelectorAll('[data-community-friend]').forEach(b => b.onclick = () => void act(async () => { await request(`/chat/friends/${b.dataset.communityFriend}/reply`, { method: 'POST', body: JSON.stringify({ accept: b.dataset.accept === 'true' }) }); await refresh(); }));
                body.querySelectorAll('[data-community-dm]').forEach(b => b.onclick = () => void act(async () => { const data = await request('/chat/conversations', { method: 'POST', body: JSON.stringify({ user_id: b.dataset.communityDm }) }); await openID(data.id); }));
                for (const b of body.querySelectorAll('[data-community-dm]')) {
                    const friend = friends.find(f => f.user_id === b.dataset.communityDm), remove = document.createElement('button');
                    remove.type = 'button';
                    remove.className = 'secondary';
                    remove.textContent = 'Remove friend';
                    remove.onclick = () => { if (confirm('Remove this friend? Shared statuses and promotion paths through this friendship will stop.'))
                        void act(async () => { await request(`/chat/friends/${friend.id}`, { method: 'DELETE' }); await refresh(); }); };
                    b.parentElement.append(remove);
                }
                const blocked = document.createElement('details');
                blocked.className = 'community-card';
                blocked.innerHTML = '<summary>Blocked people</summary><div></div>';
                body.append(blocked);
                blocked.ontoggle = () => { if (!blocked.open)
                    return; const captured = actor; void request('/chat/blocks').then(data => { if (captured !== getActor() || !blocked.isConnected)
                    return; const list = blocked.querySelector('div'); list.replaceChildren(); for (const person of data.items) {
                    const row = document.createElement('p');
                    row.textContent = `${person.name} · @${person.handle} `;
                    const unblock = document.createElement('button');
                    unblock.type = 'button';
                    unblock.textContent = 'Unblock';
                    unblock.onclick = () => void act(async () => { await request(`/chat/blocks/${person.user_id}`, { method: 'DELETE' }); row.remove(); });
                    row.append(unblock);
                    list.append(row);
                } if (!data.items.length)
                    list.textContent = 'No blocked people. Unblocking does not automatically restore friendship.'; }).catch(e => error(e.message)); };
            }
            else if (mode === 'updates')
                void root.CommunityUpdates.mount({ element: body, request, getActor, openChat: openID }).then(dispose => { if (body.isConnected)
                    disposeUpdates = dispose;
                else
                    dispose?.(); });
            else if (mode === 'town-hall')
                void root.CommunityTownHall.mount({ element: body, request, getActor, openChat: openID, roomId: hallRoomId });
            if (cursor) {
                body.insertAdjacentHTML('beforeend', button('Load more', 'data-community-more'));
                body.querySelector('[data-community-more]').onclick = () => void refresh(cursor);
            }
        }
        async function act(fn) { if (busy)
            return; busy = true; error(''); element.querySelectorAll('button').forEach(b => b.disabled = true); try {
            await fn();
        }
        catch (e) {
            error(e.message || 'Please retry.');
        }
        finally {
            busy = false;
            element.querySelectorAll('button').forEach(b => b.disabled = false);
            if (selected)
                renderMessages();
        } }
        async function refresh(older = '') {
            if (!getActor())
                return;
            if (actor !== getActor()) {
                reset();
                actor = getActor();
            }
            if (selected) { try { await readThread(); } catch(e) { error(e.message); } return; }
            if (element.contains(document.activeElement) && document.activeElement.matches('input,textarea,select'))
                return;
            const captured = actor, sequence = ++generation;
            if (!element.children.length) {
                shell();
                element.querySelector('.community-body').textContent = 'Loading conversations...';
            }
            try {
                if (!profile && ['friends','updates'].includes(mode)) {
                    const data = await request('/chat/profile');
                    if (!live(captured, sequence))
                        return;
                    profile = data;
                }
                if (!['chats', 'friends'].includes(mode)) {
                    if (element.dataset.communityMode !== mode)
                        renderList();
                    return;
                }
                const data = await request(`${mode === 'friends' ? '/chat/friends' : '/chat/inbox'}?limit=25${older ? '&cursor=' + encodeURIComponent(older) : ''}`);
                if (!live(captured, sequence))
                    return;
                const previous = mode === 'friends' ? friends : inbox;
                const next = older ? [...previous, ...(data.items || []).filter(item => !previous.some(old => old.id === item.id))] : data.items || [];
                if (mode === 'friends')
                    friends = next;
                else
                    inbox = next;
                cursor = data.next_cursor || '';
                renderList();
            }
            catch (e) {
                if (live(captured, sequence)) {
                    error(e.message);
                    const body=element.querySelector('.community-body');
                    if(body?.textContent==='Loading conversations...')body.textContent='Conversations could not load. Tap Refresh to retry.';
                }
            }
        }
        function renderThread() {
            showRoom(true);
            shell();
            const body = element.querySelector('.community-body');
            body.innerHTML = `<div class="community-row">${button('Back to chats', 'data-community-back')}<h3>${escape(selected.title)}</h3>${selected.source === 'shared' && selected.kind === 'direct' ? button('Block', 'data-community-block') + button('Report', 'data-community-report') : ''}</div><p class="community-note">${escape(selected.context?.title || '')}</p><div class="community-thread"><div class="community-history" role="log" aria-label="Chat messages"></div><div class="community-photos"></div><p class="community-note community-readonly"></p><form class="community-compose"><label aria-label="Attach photos"><input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Attach photos"/></label><textarea name="message" maxlength="2000" rows="2" aria-label="Message" placeholder="Write a message"></textarea><button type="submit">Send</button></form></div>`;
            body.querySelector('[data-community-back]').onclick = () => { threadGeneration++;if(selected.kind==='town_hall'){hallRoomId=selected.id;mode='town-hall';delete element.dataset.communityMode;} selected = null; photos.forEach(p => URL.revokeObjectURL(p.uri)); photos = []; retry = null; renderList();void refresh(); };
            const block = body.querySelector('[data-community-block]');
            if (block)
                block.onclick = () => { if (confirm('Block this person from sending you direct messages?'))
                    void act(async () => { await request(`/chat/blocks/${selected.peer_user_id}`, { method: 'POST' }); canSend = false; renderMessages(); }); };
            const report = body.querySelector('[data-community-report]');
            if (report)
                report.onclick = () => { const reason = prompt('Describe the problem (up to 1000 characters):'); if (reason)
                    void act(async () => { await request(`/chat/conversations/${selected.id}/reports`, { method: 'POST', body: JSON.stringify({ reason }) }); error('Report received for review.'); }); };
            body.querySelector('input[type=file]').onchange = e => void act(async () => {
                const captured = actor, room = selected.id;
                for (const file of Array.from(e.target.files || [])) {
                    if (photos.length >= 4)
                        throw Error('Attach up to four photos.');
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
                        throw Error('Choose JPG, PNG or WebP photos no larger than 5 MB.');
                    const data = await request('/marketplace/chat-images/presign', { method: 'POST', body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size }) });
                    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
                    let uploaded;
                    try {
                        uploaded = await fetch(data.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file, signal: controller.signal });
                    }
                    finally {
                        clearTimeout(timer);
                    }
                    if (!uploaded.ok)
                        throw Error('Photo upload failed. Please retry.');
                    if (actor !== captured || selected?.id !== room)
                        return;
                    photos.push({ key: data.key, uri: URL.createObjectURL(file) });
                }
                renderPhotos();
                e.target.value = '';
            });
            body.querySelector('.community-compose').onsubmit = e => {
                e.preventDefault();
                const form = e.currentTarget, text = form.elements.message.value.trim();
                if (!canSend || (!text && !photos.length) || busy)
                    return;
                void act(async () => {
                    const room = selected.id, captured = actor, keys = photos.map(p => p.key), fingerprint = JSON.stringify([room, text, keys]);
                    if (retry?.fingerprint !== fingerprint)
                        retry = { fingerprint, id: crypto.randomUUID() };
                    const data = await request(`/chat/conversations/${room}/messages`, { method: 'POST', body: JSON.stringify({ message: text, media_keys: keys, client_message_id: retry.id }) });
                    if (actor !== captured || selected?.id !== room)
                        return;
                    messages = merge(messages, [{ ...data, is_mine: true }]);
                    form.reset();
                    photos.forEach(p => URL.revokeObjectURL(p.uri));
                    photos = [];
                    retry = null;
                    etags.delete(room);
                    renderPhotos();
                    renderMessages();
                    // Sending is complete. A slow refresh must not lock the composer.
                    void readThread().catch(()=>{if(actor===captured&&selected?.id===room)error('Message sent. Refresh to load the latest replies.');});
                });
            };
            renderMessages();
            renderPhotos();
        }
        function merge(old, received) { return root.PortalChatHistory.merge(old,received); }
        function renderPhotos() { const target = element.querySelector('.community-photos'); if (!target)
            return; target.innerHTML = photos.map((photo, index) => `<button type="button" data-remove-photo="${index}" aria-label="Remove attached photo"><img src="${escape(photo.uri)}" alt="Attached photo"/></button>`).join(''); target.querySelectorAll('[data-remove-photo]').forEach(b => b.onclick = () => { if (busy)
            return; URL.revokeObjectURL(photos[Number(b.dataset.removePhoto)].uri); photos.splice(Number(b.dataset.removePhoto), 1); renderPhotos(); }); }
        function renderMessages() {
            const target = element.querySelector('.community-history');
            if (!target)
                return;
            const bottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100, height = target.scrollHeight, top = target.scrollTop;
            target.innerHTML = (messageCursor ? button('Load earlier messages', 'data-community-earlier') : '') + messages.map(item => `<article class="chat-bubble ${item.is_mine ? 'chat-mine' : 'chat-theirs'}">${item.sender_name && !item.is_mine ? `<strong>${escape(item.sender_name)}</strong>` : ''}<p>${escape(item.body)}</p>${(item.media_urls || []).filter(url => /^https:\/\//.test(url)).map(url => `<button type="button" data-chat-photo="${escape(url)}" aria-label="View photo"><img src="${escape(url)}" loading="lazy" alt="Chat attachment"/></button>`).join('')}<small>${escape(new Date(item.created_at).toLocaleString())}</small></article>`).join('');
            if (bottom)
                target.scrollTop = target.scrollHeight;
            else
                target.scrollTop = top + (target.scrollHeight - height);
            target.querySelector('[data-community-earlier]')?.addEventListener('click', () => void readThread(messageCursor));
            const form = element.querySelector('.community-compose');
            form.querySelectorAll('textarea,input,button').forEach(node => node.disabled = !canSend || busy);
            element.querySelector('.community-readonly').textContent = canSend ? '' : 'This conversation is read-only, blocked, or needs subscription renewal.';
        }
        function acknowledge(room,message,captured) {
            if(!message||document.hidden||readAcknowledged.get(room)===message||readPending.has(room))return;
            const flight=request(`/chat/conversations/${room}/read`,{method:'POST',body:JSON.stringify({message_id:message})});
            readPending.set(room,flight);
            void flight.then(()=>{if(captured===getActor())readAcknowledged.set(room,message);}).catch(()=>{/* Retry on the next history refresh; sending stays available. */}).finally(()=>{if(readPending.get(room)===flight)readPending.delete(room);});
        }
        function readThread(older = '') {
            if(!selected)return Promise.resolve();
            const key=JSON.stringify([actor,selected.id,threadGeneration,older]);
            if(readFlights.has(key))return readFlights.get(key);
            const flight=loadThread(older);readFlights.set(key,flight);
            void flight.finally(()=>{if(readFlights.get(key)===flight)readFlights.delete(key);}).catch(()=>{});
            return flight;
        }
        async function loadThread(older = '') {
            if (!selected)
                return;
            const room = selected.id, captured = actor, sequence = threadGeneration;
            const data = await request(`/chat/conversations/${room}/messages?limit=40&mark_read=false${older ? '&cursor=' + encodeURIComponent(older) : ''}`, { headers: !older && etags.has(room) ? { 'If-None-Match': etags.get(room) } : {} });
            if (sequence !== threadGeneration || captured !== getActor() || selected?.id !== room)
                return;
            if (data.unchanged) {
                const latest = messages.at(-1);
                if (!older && latest && !document.hidden && readAcknowledged.get(room) !== latest.id) {
                    acknowledge(room,latest.id,captured);
                }
                return;
            }
            if (data._etag && !older)
                etags.set(room, data._etag);
            const incoming=data.items||[],first=incoming[0],oldest=messages[0];
            const keepEarlierCursor=!older&&oldest&&first&&(oldest.created_at<first.created_at||(oldest.created_at===first.created_at&&oldest.id<first.id));
            const nextCursor=keepEarlierCursor?messageCursor:(data.next_cursor||'');
            const next=merge(messages, incoming.map(item => ({ ...item, is_mine: selected.source === 'legacy' ? item.sender_type === selected.actor_role : item.is_mine })));
            const changed=JSON.stringify(next)!==JSON.stringify(messages)||messageCursor!==nextCursor||canSend!==(data.can_send!==false&&selected.state==='open');
            messages=next;
            messageCursor = nextCursor;
            canSend = data.can_send !== false && selected.state === 'open';
            cache.put(actor, room, messages, messageCursor);
            if(changed)renderMessages();
            if (!older && messages.length && !document.hidden) {
                acknowledge(room,messages.at(-1).id,captured);
            }
        }
        async function open(item) { if (!item)
            return; generation++; threadGeneration++;selected = item; mode = 'chats'; const cached = cache.get(actor, item.id);if(!cached)etags.delete(item.id); messages = cached?.messages || []; messageCursor = cached?.cursor || ''; canSend = item.state === 'open'; photos = []; retry = null; renderThread(); if (history.state?.communityChat !== item.id)
            history.pushState({ providerView: 'messages', communityChat: item.id }, '', location.pathname + '?view=messages&shared=' + encodeURIComponent(item.id)); try {
            await readThread();
        }
        catch (e) {
            error(e.message);
        } }
        async function openID(id) { if (!validID(id))
            return; const captured = actor, data = await request('/chat/inbox?conversation_id=' + encodeURIComponent(id)); if (captured !== getActor())
            return; if (data.items?.[0])
            await open(data.items[0]);
        else
            error('This conversation is no longer available.'); }
        async function activate(options = {}) { if (actor !== getActor()) {
            reset();
            actor = getActor();
        } if (options.mode)
            { threadGeneration++;showRoom(false);mode = options.mode; selected=null; delete element.dataset.communityMode; } if (options.hallRoomId) {
            hallRoomId = options.hallRoomId;
            mode = 'town-hall';
            selected = null;
            delete element.dataset.communityMode;
        } await refresh(); if (options.conversationId)
            await openID(options.conversationId); if (options.invite) {
            mode = 'friends';
            selected = null;
            await refresh();
            const input = element.querySelector('.community-find input');
            if (input)
                input.value = options.invite;
        } }
        return { activate, refresh, reset, isOpen: () => !!selected, close: () => { threadGeneration++; selected = null; renderList();void refresh(); }, openID };
    }
    root.CommunityPortal = { create };
})(typeof window !== 'undefined' ? window : globalThis);
