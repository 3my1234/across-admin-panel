(function(){
 'use strict';
 const gear='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 3-.5 2-2 1-2-.5L3 9l1.5 1.5v3L3 15l1.5 3.5 2-.5 2 1 .5 2h6l.5-2 2-1 2 .5L21 15l-1.5-1.5v-3L21 9l-1.5-3.5-2 .5-2-1-.5-2Z"/><circle cx="12" cy="12" r="3"/></svg>';
 const provider=!!document.getElementById('providerSupportReply');
 const target=document.querySelector(provider?'.header-actions':'.topbar .action-row');if(!target)return;
 const dialog=document.createElement('dialog');dialog.className='atl-settings';dialog.setAttribute('aria-label','Settings');
 dialog.innerHTML='<header><h2>Settings</h2><button type="button" data-close-settings aria-label="Close settings">✕</button></header><div data-settings-content></div>';
 document.body.append(dialog);const body=dialog.querySelector('[data-settings-content]');
 const group=label=>{const section=document.createElement('section');section.innerHTML='<h3>'+label+'</h3>';body.append(section);return section;};
 const appearance=group('Appearance');const controls=[...document.querySelectorAll('.appearance-control')];if(controls[0])appearance.append(controls[0]);for(const control of controls.slice(1))control.remove();
 if(provider){const notifications=group('Notifications and app');for(const id of ['enableProviderNotifications','providerPushStatus','installProviderApp']){const node=document.getElementById(id);if(node)notifications.append(node);}
  const business=group('Business account');const branding=document.getElementById('providerBranding');if(branding)business.append(branding);const subscription=document.querySelector('[data-view="subscription"]');if(subscription)business.append(subscription);
  const verification=document.getElementById('verificationDocuments');if(verification)business.append(verification);
 }else{const account=group('Administration');const admins=document.querySelector('.side-nav [data-tab="admins"]');if(admins)account.append(admins);}
 const account=group('Account');const logout=document.getElementById(provider?'signOut':'logoutButton');if(logout)account.append(logout);
 const button=document.createElement('button');button.type='button';button.className='atl-settings-button secondary';button.setAttribute('aria-label','Open settings');button.innerHTML=gear+'<span>Settings</span>';button.onclick=()=>dialog.showModal();target.append(button);
 dialog.querySelector('[data-close-settings]').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target.closest('[data-view],[data-tab]'))dialog.close();});
 window.addEventListener('popstate',()=>{if(dialog.open)dialog.close();});
})();
