(function (root) {
    "use strict";
    const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const validID = id => /^[a-f0-9-]{36}$/i.test(id || '');
    function create({ element, request, getActor }) {
        let actor = '', mode = 'chats', inbox = [], selected = null, messages = [], cursor = '', messageCursor = '', canSend = true, generation = 0, threadGeneration = 0, busy = false, photos = [], retry = null, hallRoomId = '';
        const etags = new Map(), readAcknowledged = new Map(), readPending = new Map(), readFlights = new Map(), cache = root.PortalChatHistory.create();
        function showRoom(open) { element.classList.toggle('community-room-open',open);if(!open)element.classList.remove('community-town-room');document.body.classList.toggle('community-chat-open',open); }
        const live = (captured, sequence) => captured === getActor() && captured === actor && sequence === generation;
        const button = (text, attributes = '', secondary = true) => `<button type="button" class="${secondary ? 'secondary' : ''}" ${attributes}>${escape(text)}</button>`;
        function error(message) { const target = element.querySelector('.community-error'); if (target)
            target.textContent = message || ''; }
        function reset() { generation++; threadGeneration++; showRoom(false); actor = '';mode='chats';hallRoomId=''; inbox = []; selected = null; messages = []; photos.forEach(p => URL.revokeObjectURL(p.uri)); photos = []; retry = null; etags.clear();readAcknowledged.clear();readPending.clear();readFlights.clear(); cache.clear(); element.replaceChildren(); delete element.dataset.communityMode; }
        function shell() { element.innerHTML = `<div class="community-tabs">${[['chats', 'Chats'], ['town-hall', 'Town Hall']].map(([key, label]) => button(label, `data-community-mode="${key}" class="${mode === key ? 'is-active' : ''}"`)).join('')}</div><p class="community-error" role="status"></p><div class="community-body"></div>`; for (const b of element.querySelectorAll('[data-community-mode]')) {
            b.classList.toggle('is-active', b.dataset.communityMode === mode);
            b.onclick = () => { threadGeneration++; selected = null; mode = b.dataset.communityMode; cursor = ''; void refresh(); };
        } }
        function renderList() {
            showRoom(false);
            shell();
            element.dataset.communityMode = mode;
            const body = element.querySelector('.community-body');
            if (mode === 'chats') {
                body.innerHTML = inbox.length ? inbox.map(item => `<article class="community-card ${item.unread_count ? 'community-unread' : ''}"><div class="community-row"><div style="flex:1">${root.ProviderIdentity?.render(item.provider_identity) || `<h3>${escape(item.title)}</h3>`}<p>${escape(item.kind === 'business' ? item.context?.title || 'Product or service enquiry' : item.kind === 'town_hall' ? 'Town Hall bargaining' : 'Private chat')}</p></div>${item.unread_count ? `<span class="community-count">${Number(item.unread_count)}</span>` : ''}${button('Open', `data-community-chat="${item.id}"`)}</div></article>`).join('') : '<p>Your conversations appear here. Customer messages about your products and services appear here.</p>';
                element.querySelectorAll('[data-community-chat]').forEach(b => b.onclick = () => void open(inbox.find(item => item.id === b.dataset.communityChat)));
            }
            else if (mode === 'town-hall')
                void root.CommunityTownHall.mount({element:body,request,getActor,openChat:openID,roomId:hallRoomId});
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
                if (mode !== 'chats') {
                    if (element.dataset.communityMode !== mode)
                        renderList();
                    return;
                }
                const data = await request(`/chat/inbox?limit=25${older ? '&cursor=' + encodeURIComponent(older) : ''}`);
                if (!live(captured, sequence))
                    return;
                const previous = inbox;
                const next = older ? [...previous, ...(data.items || []).filter(item => !previous.some(old => old.id === item.id))] : data.items || [];
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
            element.classList.toggle('community-town-room',selected.kind==='town_hall');
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
            const room=selected.kind==='town_hall';
            target.innerHTML = (messageCursor ? button('Earlier messages', 'data-community-earlier') : room?`<div class="room-welcome">Welcome to the room<br><strong>Topic: ${escape(selected.title)}</strong></div>`:'') + messages.map(item => {const name=item.sender_name||(item.is_mine?'You':'Provider');const colour=Array.from(name).reduce((sum,c)=>sum+c.charCodeAt(0),0)%5;return `<article class="chat-bubble ${item.is_mine ? 'chat-mine' : 'chat-theirs'} ${room?'room-line':''}">${room?`<span class="room-name room-name-${colour}">${escape(name)}</span> `:item.sender_name&&!item.is_mine?`<strong>${escape(item.sender_name)}</strong>`:''}<${room?'span':'p'}>${escape(item.body)}</${room?'span':'p'}>${(item.media_urls || []).filter(url => /^https:\/\//.test(url)).map(url => `<button type="button" data-chat-photo="${escape(url)}" aria-label="View photo"><img src="${escape(url)}" loading="lazy" alt="Chat attachment"/></button>`).join('')}<small>${escape(room?new Date(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):new Date(item.created_at).toLocaleString())}</small></article>`;}).join('');
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
            {const url=new URL(location.href);url.searchParams.set('view','messages');url.searchParams.set('shared',item.id);for(const key of ['conversation','hall','ticket'])url.searchParams.delete(key);history.pushState({ providerView: 'messages', communityChat: item.id }, '', url.pathname+url.search);} try {
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
            { threadGeneration++;showRoom(false);mode = options.mode==='town-hall'?'town-hall':'chats'; selected=null; delete element.dataset.communityMode; } if (options.hallRoomId) {
            hallRoomId = options.hallRoomId;
            mode = 'town-hall';
            selected = null;
            delete element.dataset.communityMode;
        } await refresh(); if (options.conversationId)
            await openID(options.conversationId); }
        return { activate, refresh, reset, isOpen: () => !!selected, close: () => { threadGeneration++; selected = null; renderList();void refresh(); }, openID };
    }
    root.CommunityPortal = { create };
})(typeof window !== 'undefined' ? window : globalThis);
