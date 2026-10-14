const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    const pages = await (await fetch('http://127.0.0.1:9224/json')).json(), socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', event => { const item = JSON.parse(event.data); if (item.id) {
        const task = pending.get(item.id);
        pending.delete(item.id);
        item.error ? task.reject(item.error) : task.resolve(item.result);
    } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
    const evaluate = async (expression) => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails)
        throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    try {
        await send('Page.enable');
        for (const width of [320, 390, 768, 1440]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
            await send('Page.navigate', { url: (process.env.COMMUNITY_TEST_ORIGIN || 'http://127.0.0.1:5175')+'/provider.html' });
            await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{if(document.readyState==='complete'&&window.CommunityPortal&&window.CommunityUpdates&&window.CommunityTownHall)return resolve();if(++tries>100)return reject(Error('Community modules did not load'));setTimeout(poll,50)};poll()})`);
            await evaluate(`(async()=>{
 window.__errors=[];addEventListener('error',event=>__errors.push(event.message));window.__actor='first-account';window.__calls=[];window.__failSend=false;window.__historyAt=new Date().toISOString();window.__legacy=false;window.__holdRead=false;window.__holdHistory=false;
 const host=document.createElement('section');host.id='communityBrowserRoot';host.style.cssText='position:fixed;inset:8px;overflow:auto;z-index:999;background:var(--dashboard-surface,#fff)';document.body.append(host);
 const room='11111111-1111-4111-8111-111111111111',friend='22222222-2222-4222-8222-222222222222',hall='33333333-3333-4333-8333-333333333333';
 const request=async(path,options={})=>{__calls.push([path,options.method||'GET',options.body]);
 if(path==='/chat/profile')return {handle:'emma',discoverable:true,connection_promotions:false};
 if(path.startsWith('/chat/friends'))return {items:[{id:friend,user_id:friend,name:'Friend',handle:'friend',state:'accepted'}]};
 if(path==='/chat/blocks')return {items:[]};
 if(path.startsWith('/chat/inbox')){if(window.__failInbox)throw Error('Community is temporarily unavailable. Please retry');return {items:[{id:room,source:__legacy?'legacy':'shared',kind:__legacy?'business':'direct',actor_role:__legacy?'provider':'member',title:__legacy?'Buyer enquiry':'Friend',state:'open',unread_count:1,context:{},peer_user_id:friend}]};}
 if(path==='/chat/conversations')return {id:room};
 if(path.includes('/read')){if(__holdRead)await new Promise(resolve=>window.__releaseRead=resolve);return {};}
 if(__legacy&&path.includes('/messages')&&path.includes('cursor=older80'))return {items:[],next_cursor:'',can_send:true};
 if(__legacy&&path.includes('/messages')&&path.includes('cursor=older40'))return {items:Array.from({length:40},(_,i)=>({id:'99999999-0000-4000-8000-'+String(i+1).padStart(12,'0'),body:'Earlier buyer message',sender_type:'buyer',created_at:'2020-01-01T00:00:00.000Z'})),next_cursor:'older80',can_send:true};
 if(path.includes('/messages')){if(options.method==='POST'){if(__failSend)throw Error('Temporary send failure');return {id:'44444444-4444-4444-8444-444444444444',body:JSON.parse(options.body).message,created_at:new Date().toISOString(),is_mine:true,sender_type:'provider'}}if(__holdHistory)await new Promise(resolve=>window.__releaseHistory=resolve);if(window.__notModified&&options.headers?.['If-None-Match'])return {unchanged:true};const items=__legacy?Array.from({length:40},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),body:'A detailed buyer enquiry. '.repeat(20),created_at:__historyAt,is_mine:false,sender_type:'buyer'})):[{id:friend,body:'Hello',created_at:__historyAt,is_mine:false,sender_type:'buyer'}];return {_etag:'steady',items,next_cursor:__legacy?'older40':'',can_send:true};}
 if(path.startsWith('/chat/statuses'))return {items:[]};
 if(path.startsWith('/chat/promotions'))return {items:[],pending:false};
 const preview={id:hall,title:'50 bags of rice',buyer_name:'Amina',created_at:new Date().toISOString(),message_only:true,description:'I need 50 bags of rice for an occasion in Abuja. My budget is ₦48,500 per bag. Who can help?',location:'',quantity:null,unit:'',target_unit_price:null,state:'open',is_owner:true,admitted:true,seats:0,offers:[],applications:[]};
 if(path.startsWith('/chat/town-hall?'))return {items:[preview]};
 if(path==='/chat/town-hall/'+hall)return preview;
 return {};};
 window.__community=CommunityPortal.create({element:host,request,getActor:()=>__actor});await __community.activate();
 })()`);
            assert.equal(await evaluate(`document.getElementById('communityBrowserRoot').scrollWidth<=document.getElementById('communityBrowserRoot').clientWidth+1`), true, `layout at ${width}`);
            await evaluate(`__community.activate({mode:'friends'})`);
            assert.equal(await evaluate(`!!document.querySelector('#communityBrowserRoot .community-profile')`), true);
            await evaluate(`(()=>{const choice=document.querySelector('[data-theme-preference]');choice.value='dark';choice.dispatchEvent(new Event('change'))})()`);
            assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('#communityBrowserRoot .community-card')).backgroundColor`), 'rgb(255, 255, 255)', 'dark theme must not leave a white card');
            await evaluate(`(()=>{const choice=document.querySelector('[data-theme-preference]');choice.value='light';choice.dispatchEvent(new Event('change'))})()`);
            await evaluate(`__community.activate({mode:'updates'})`);
            await delay(80);
            assert.equal(await evaluate(`!!document.querySelector('#communityBrowserRoot .community-status-form')`), true);
            await evaluate(`document.querySelector('#communityBrowserRoot .community-status-form textarea').value='Keep this draft';__community.refresh()`);
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot .community-status-form textarea').value`), 'Keep this draft');
            await evaluate(`document.activeElement.blur();__community.activate({mode:'town-hall'})`);
            await delay(80);
            assert.equal(await evaluate(`!!document.querySelector('#communityBrowserRoot [data-hall-create]')`), true);
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot [data-hall-create]').querySelectorAll('input,textarea').length`),1,'one message field, no structured request form');
            assert.equal(await evaluate(`document.getElementById('communityBrowserRoot').scrollWidth<=document.getElementById('communityBrowserRoot').clientWidth+1`),true,'Hall fits viewport');
            await evaluate(`document.querySelector('#communityBrowserRoot [data-hall-detail]').click()`);
            await delay(80);
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot .community-body').textContent.includes('Offers on the table')`), true);
            await evaluate(`__community.openID('11111111-1111-4111-8111-111111111111')`);
            await evaluate(`document.getElementById('communityBrowserRoot').style.cssText='margin:320px 8px 0;background:var(--dashboard-surface,#fff)';window.scrollTo(0,0)`);
            assert.ok((await evaluate(`document.querySelector('#communityBrowserRoot .community-compose').getBoundingClientRect().bottom`))<=844,'reply composer must be visible without scrolling past provider header');
            await evaluate(`document.querySelector('#communityBrowserRoot .community-compose textarea').value='Retry me';__failSend=true;document.querySelector('#communityBrowserRoot .community-compose').requestSubmit()`);
            await delay(80);
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot .community-compose textarea').value`), 'Retry me');
            await evaluate(`__failSend=false;document.querySelector('#communityBrowserRoot .community-compose').requestSubmit()`);
            await delay(80);
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot .community-compose textarea').value`), '');
            assert.equal(await evaluate(`(()=>{const sends=__calls.filter(([path,method])=>path.includes('/messages')&&method==='POST');return JSON.parse(sends[0][2]).client_message_id===JSON.parse(sends[1][2]).client_message_id})()`), true, 'same retry reference');
            await evaluate(`window.__realNow=Date.now;Date.now=()=>__realNow()+360001;window.__notModified=true;__community.openID('11111111-1111-4111-8111-111111111111')`);
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot .community-history').textContent.includes('Hello')`),true,'expired private cache must fetch history instead of accepting an empty 304');await evaluate(`Date.now=__realNow;window.__notModified=false`);
            await send('Emulation.setDeviceMetricsOverride', { width, height: 450, deviceScaleFactor: 1, mobile: width < 768 });
            await evaluate(`document.documentElement.style.setProperty('--visible-viewport-height','450px');document.querySelector('#communityBrowserRoot textarea').focus();document.querySelector('#communityBrowserRoot .community-compose').scrollIntoView({block:'end'})`);
            assert.ok((await evaluate(`document.querySelector('#communityBrowserRoot .community-compose').getBoundingClientRect().bottom`)) <= 450, 'community composer stays reachable with reduced keyboard viewport');
            await evaluate(`document.activeElement.blur();__failInbox=true;__community.reset();__community.activate()`);
            assert.equal(await evaluate(`document.getElementById('communityBrowserRoot').textContent.includes('Loading conversations...')`),false,'failed request must end loading state');
            await evaluate(`__community.activate({mode:'town-hall'})`);await delay(80);
            assert.equal(await evaluate(`!!document.querySelector('#communityBrowserRoot [data-hall-create]')`),true,'Hall remains reachable independently of inbox failure');
            await evaluate(`__failInbox=false;__actor='second-account';__community.reset()`);
            assert.equal(await evaluate(`document.getElementById('communityBrowserRoot').textContent`), '');
            await evaluate(`__legacy=true;__holdRead=true;__community.activate()`);
            await evaluate(`window.__opened=false;__community.openID('11111111-1111-4111-8111-111111111111').then(()=>__opened=true)`);await delay(100);
            assert.equal(await evaluate(`__opened`),true,'slow read acknowledgement must not hold chat opening');
            assert.ok((await evaluate(`document.querySelector('#communityBrowserRoot .community-compose').getBoundingClientRect().bottom`))<=450,'long buyer history must not push composer below visible viewport');
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot .community-compose button').disabled`),false,'business reply stays enabled during slow receipts');
            await evaluate(`document.querySelector('#communityBrowserRoot [data-community-earlier]').click()`);await delay(80);
            await evaluate(`__community.refresh()`);
            await evaluate(`document.querySelector('#communityBrowserRoot [data-community-earlier]').click()`);await delay(80);
            assert.equal(await evaluate(`__calls.some(c=>c[0].includes('cursor=older80'))`),true,'latest refresh must not reset older-history pagination');
            await evaluate(`__holdHistory=true;window.__refreshCount=__calls.filter(c=>c[0].includes('/messages')&&c[1]==='GET').length;window.__refreshFlight=Promise.all([__community.refresh(),__community.refresh(),__community.refresh()]);void 0`);await delay(80);
            assert.equal(await evaluate(`__calls.filter(c=>c[0].includes('/messages')&&c[1]==='GET').length-__refreshCount`),1,'concurrent refresh events share one history request');
            await evaluate(`__holdHistory=false;__releaseHistory();__refreshFlight`);
            await evaluate(`window.__oldBubble=document.querySelector('#communityBrowserRoot .chat-bubble');__community.refresh()`);
            assert.equal(await evaluate(`__oldBubble===document.querySelector('#communityBrowserRoot .chat-bubble')`),true,'unchanged history must preserve existing DOM');
            await evaluate(`__holdHistory=true;document.querySelector('#communityBrowserRoot textarea').value='Provider reply';document.querySelector('#communityBrowserRoot .community-compose').requestSubmit()`);await delay(100);
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot .community-compose button').disabled`),false,'successful send releases composer before history refresh');
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot textarea').value`),'','successful business send clears its draft');
            await evaluate(`document.querySelector('#communityBrowserRoot textarea').value='Next message';__holdHistory=false;__releaseHistory();__holdRead=false;__releaseRead()`);await delay(80);
            assert.equal(await evaluate(`document.querySelector('#communityBrowserRoot textarea').value`),'Next message','delayed history must retain the next draft');
            await evaluate(`__community.close()`);await delay(80);
            assert.equal(await evaluate(`document.body.classList.contains('community-chat-open')`),false,'closing chat restores page scrolling');
            await evaluate(`__community.reset()`);
            assert.equal(await evaluate(`__errors.length`), 0);
        }
        console.log('Community browser passed: responsive tabs, friend controls, status draft preservation, Town Hall preview, stable send retry and account reset.');
    }
    finally {
        socket.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
