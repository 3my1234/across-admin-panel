(function(root){
 'use strict';let hooks=null,nonce='',started=false;
 const isEmbedded=new URLSearchParams(location.search).get('embedded')==='1'&&typeof root.ReactNativeWebView?.postMessage==='function';
 const embedded=()=>isEmbedded;
 const send=(type,data={})=>{if(embedded()&&nonce)root.ReactNativeWebView.postMessage(JSON.stringify({type,nonce,...data}));};
 function attach(callbacks){hooks=callbacks;if(!embedded())return false;
  root.ATLProviderNativeStart=async config=>{if(!config||typeof config.token!=='string'||!config.token||typeof config.nonce!=='string')return;nonce=config.nonce;
   if(['system','light','dark'].includes(config.preference)){localStorage.setItem('atl.appearance.v1',config.preference);root.dispatchEvent(new StorageEvent('storage',{key:'atl.appearance.v1',newValue:config.preference}));}
   if(started)return;started=true;localStorage.setItem('atlantic.provider.token',config.token);try{await hooks.start(config.token);}catch(error){started=false;hooks.error?.(error);}
  };
  root.ATLProviderNativeResume=()=>{if(started)void hooks.resume();};
  document.querySelector('[data-theme-preference]')?.addEventListener('change',e=>send('provider-theme',{value:e.target.value}));
  root.ReactNativeWebView.postMessage(JSON.stringify({type:'provider-ready'}));return true;
 }
 root.ProviderNativeBridge={embedded,attach,signedOut:()=>send('provider-signed-out')};
})(globalThis);
