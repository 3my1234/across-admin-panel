(function (root) {
    "use strict";
    const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const validID = id => /^[a-f0-9-]{36}$/i.test(id || '');
    function create({ element, request, getActor }) {
        let locationPin=null;
        let actor = '', mode = 'chats', inbox = [], selected = null, messages = [], cursor = '', messageCursor = '', canSend = true, generation = 0, threadGeneration = 0, busy = false, photos = [], retry = null, hallRoomId = '', searchQuery = '', inboxConfirmed=false;
        const etags = new Map(), readAcknowledged = new Map(), readPending = new Map(), readFlights = new Map(), cache = root.PortalChatHistory.create();
        function showRoom(open) { element.classList.toggle('community-room-open',open);if(!open)element.classList.remove('community-town-room');document.body.classList.toggle('community-chat-open',open); }
        const live = (captured, sequence) => captured === getActor() && captured === actor && sequence === generation;
        const button = (text, attributes = '', secondary = true) => `<button type="button" class="${secondary ? 'secondary' : ''}" ${attributes}>${escape(text)}</button>`;
        function error(message) { const target = element.querySelector('.community-error'); if (target)
            target.textContent = message || ''; }
        function reset() { generation++; threadGeneration++; showRoom(false); if(actor)void root.PrivateChatStore?.clear(actor); actor = '';mode='chats';searchQuery='';hallRoomId=''; inbox = []; selected = null; messages = []; photos.forEach(p => URL.revokeObjectURL(p.uri)); photos = []; locationPin=null; retry = null; etags.clear();readAcknowledged.clear();readPending.clear();readFlights.clear(); cache.clear(); inboxConfirmed=false; element.replaceChildren(); delete element.dataset.communityMode; }
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
                body.innerHTML='<label class="chat-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search recent chats" aria-label="Search recent chats" value="'+escape(searchQuery)+'"/></label><div class="chat-inbox"></div>';
                const draw=()=>{const items=inbox.filter(item=>(item.title+' '+(item.last_message||'')+' '+(item.context?.title||'')).toLowerCase().includes(searchQuery.toLowerCase()));body.querySelector('.chat-inbox').innerHTML=items.map(item=>{const name=item.title||'Chat',identity=item.actor_role==='provider'?null:item.provider_identity,avatar=identity?.avatar_url||item.avatar_url;return '<article class="chat-inbox-row '+(item.unread_count?'community-unread':'')+'"><span class="chat-avatar">'+(/^https:\/\//.test(avatar||'')?'<img src="'+escape(avatar)+'" alt="" loading="lazy"/>':escape(name.slice(0,1).toUpperCase()))+'</span><div class="chat-inbox-copy">'+(root.ProviderIdentity?.render(identity)||'<strong>'+escape(name)+'</strong>')+'<p>'+escape(item.last_message||item.context?.title||(item.kind==='town_hall'?'Town Hall conversation':'Start a conversation'))+'</p></div><div class="chat-inbox-meta"><time>'+escape(item.last_message_at?new Date(item.last_message_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'')+'</time>'+(item.unread_count?'<span class="community-count">'+Number(item.unread_count)+'</span>':'')+'<button type="button" data-community-chat="'+item.id+'" aria-label="Open chat with '+escape(name)+'">›</button></div></article>';}).join('')||'<p class="community-note">'+(inbox.length?'No matching recent chats.':'Your product and service conversations appear here.')+'</p>';body.querySelectorAll('[data-community-chat]').forEach(button=>{const row=button.closest('.chat-inbox-row');row.onclick=event=>{if(event.target.closest('[data-provider-badge]'))return;void open(inbox.find(item=>item.id===button.dataset.communityChat));};});};
                body.querySelector('input[type=search]').oninput=event=>{searchQuery=event.target.value;draw();};draw();
            }
            else if (mode === 'town-hall')
                void root.CommunityTownHall.mount({element:body,request,getActor,openChat:openID,roomId:hallRoomId});
            if (cursor) {
                body.insertAdjacentHTML('beforeend', button('Load more', 'data-community-more'));
                body.querySelector('[data-community-more]').onclick = () => void refresh(cursor);
            }
        }
        async function act(fn) { if (busy)
            return; busy = true; error(''); if(selected)renderMessages(); try {
            await fn();
        }
        catch (e) {
            error(e.message || 'Please retry.');
        }
        finally {
            busy = false;
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
            if(!inbox.length)void root.PrivateChatStore?.get(captured,'inbox').then(saved=>{if(saved&&live(captured,sequence)&&!inbox.length&&!selected&&!inboxConfirmed){inbox=saved;renderList();}});
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
                inboxConfirmed=true;inbox = next;root.PrivateChatStore?.put(actor,'inbox',inbox.slice(0,25));
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
            body.innerHTML = `<div class="community-row">${button('←', 'data-community-back aria-label="Back to chats"')}<span class="chat-header-avatar">${((selected.actor_role==='provider'?selected.avatar_url:selected.provider_identity?.avatar_url||selected.avatar_url)?'<img src="'+escape(selected.actor_role==='provider'?selected.avatar_url:selected.provider_identity?.avatar_url||selected.avatar_url)+'" alt=""/>':escape(selected.title.slice(0,1).toUpperCase()))}</span><h3>${escape(selected.title)}</h3>${selected.source === 'shared' && selected.kind === 'direct' ? '<details class="chat-safety"><summary aria-label="Conversation options">⋮</summary>'+button('Block', 'data-community-block') + button('Report', 'data-community-report')+'</details>' : ''}</div><p class="community-note">${escape(selected.context?.title || '')}</p>${root.ProviderIdentity?.banner(selected.actor_role==='provider'?null:selected.provider_identity)||''}<div class="community-thread"><div class="community-history" role="log" aria-label="Chat messages"></div><div class="community-photos"></div><p class="community-note community-readonly"></p><form class="community-compose"><label aria-label="Attach photos"><input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Attach photos"/></label><button type="button" data-share-location aria-label="Share location pin">📍</button><textarea name="message" maxlength="2000" rows="1" aria-label="Message" placeholder="Write a message"></textarea><button type="submit">Send</button></form></div>`;
            body.querySelector('[data-community-back]').onclick = () => { threadGeneration++;if(selected.kind==='town_hall'){hallRoomId=selected.id;mode='town-hall';delete element.dataset.communityMode;} selected = null; photos.forEach(p => URL.revokeObjectURL(p.uri)); photos = []; locationPin=null; retry = null; renderList();void refresh(); };
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
            body.querySelector('[data-share-location]').onclick=()=>{if(!canSend||busy)return;if(!confirm(selected.kind==='town_hall'?'Share an exact location pin with everyone admitted to this Town Hall room?':'Share an exact location pin with the other person in this chat?'))return;const room=selected.id,captured=actor;void act(async()=>{const pin=await root.AtlLocation.capture();if(actor!==captured||selected?.id!==room)return;delete pin.captured_at;locationPin=pin;renderPhotos();});};
            body.querySelector('.community-compose').onsubmit = e => {
                e.preventDefault();
                const form = e.currentTarget, text = form.elements.message.value.trim();
                if (!canSend || (!text && !photos.length && !locationPin) || busy)
                    return;
                void act(async () => {
                    const room = selected.id, captured = actor, keys = photos.map(p => p.key), fingerprint = JSON.stringify([room, text, keys,locationPin]);
                    if (retry?.fingerprint !== fingerprint)
                        retry = { fingerprint, id: crypto.randomUUID() };
                    const data = await request(`/chat/conversations/${room}/messages`, { method: 'POST', body: JSON.stringify({ message: text, media_keys: keys,location:locationPin, client_message_id: retry.id }) });
                    if (actor !== captured || selected?.id !== room)
                        return;
                    if(!data?.id||!data.created_at)throw Error('The server did not confirm your message. Please retry.');
                    messages = merge(messages, [{ ...data, is_mine: true }]);
                    form.reset();
                    photos.forEach(p => URL.revokeObjectURL(p.uri));
                    photos = [];locationPin=null;
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
            return; target.innerHTML = photos.map((photo, index) => `<button type="button" data-remove-photo="${index}" aria-label="Remove attached photo"><img src="${escape(photo.uri)}" alt="Attached photo"/></button>`).join('')+(locationPin?root.AtlLocation.render(locationPin,{draft:true})+'<button type="button" data-remove-pin>Remove location</button>':'');target.querySelector('[data-remove-pin]')?.addEventListener('click',()=>{if(!busy){locationPin=null;renderPhotos();}}); target.querySelectorAll('[data-remove-photo]').forEach(b => b.onclick = () => { if (busy)
            return; URL.revokeObjectURL(photos[Number(b.dataset.removePhoto)].uri); photos.splice(Number(b.dataset.removePhoto), 1); renderPhotos(); }); }
        function renderMessages() {
            const target = element.querySelector('.community-history');
            if (!target)
                return;
            const bottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100, height = target.scrollHeight, top = target.scrollTop;
            const room=selected.kind==='town_hall';
            target.innerHTML = (messageCursor ? button('Earlier messages', 'data-community-earlier') : room?`<div class="room-welcome">Welcome to the room<br><strong>Topic: ${escape(selected.title)}</strong></div>`:'') + messages.map(item => {const name=item.sender_name||(item.is_mine?'You':'Provider');const colour=Array.from(name).reduce((sum,c)=>sum+c.charCodeAt(0),0)%5;return `<article class="chat-bubble ${item.is_mine ? 'chat-mine' : 'chat-theirs'} ${room?'room-line':''}">${room?`<span class="room-name room-name-${colour}">${escape(name)}</span> `:item.sender_name&&!item.is_mine?`<strong>${escape(item.sender_name)}</strong>`:''}<${room?'span':'p'}>${escape(item.body)}</${room?'span':'p'}>${root.AtlLocation?.render(item.location)||''}${(item.media_urls || []).filter(url => /^https:\/\//.test(url)).map(url => `<button type="button" data-chat-photo="${escape(url)}" aria-label="View photo"><img src="${escape(url)}" loading="lazy" alt="Chat attachment"/></button>`).join('')}<small>${escape(new Date(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</small></article>`;}).join('');
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
            cache.put(actor, room, messages, messageCursor);if(!older&&selected.kind!=='town_hall')root.PrivateChatStore?.put(actor,room,{messages:incoming,cursor:data.next_cursor||''});
            if(changed)renderMessages();
            if (!older && messages.length && !document.hidden) {
                acknowledge(room,messages.at(-1).id,captured);
            }
        }
        async function open(item) { if (!item)
            return; generation++; threadGeneration++;selected = item; mode = 'chats'; const cached = cache.get(actor, item.id);if(!cached)etags.delete(item.id); messages = cached?.messages || []; messageCursor = cached?.cursor || ''; canSend = item.state === 'open'; photos = []; locationPin=null; retry = null; renderThread(); if(!cached&&item.kind!=='town_hall'){const captured=actor,version=threadGeneration;void root.PrivateChatStore?.get(captured,item.id).then(saved=>{if(saved&&captured===getActor()&&version===threadGeneration&&!messages.length){messages=saved.messages;messageCursor=saved.cursor||'';renderMessages();}});} if (history.state?.communityChat !== item.id)
            {const url=new URL(location.href);url.searchParams.set('view','messages');url.searchParams.set('shared',item.id);for(const key of ['conversation','hall','ticket'])url.searchParams.delete(key);history.pushState({ providerView: 'messages', communityChat: item.id }, '', url.pathname+url.search);} try {
            await readThread();
        }
        catch (e) {
            error(e.message);
        } }
        async function openID(id) { if (!validID(id))
            return; const known=inbox.find(item=>item.id===id);if(known)return open(known); const captured = actor, data = await request('/chat/inbox?conversation_id=' + encodeURIComponent(id)); if (captured !== getActor())
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
