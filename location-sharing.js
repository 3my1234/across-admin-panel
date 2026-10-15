(function(root){
 'use strict';
 function valid(pin){return !!pin&&Number.isFinite(pin.latitude)&&Number.isFinite(pin.longitude)&&Math.abs(pin.latitude)<=90&&Math.abs(pin.longitude)<=180;}
 function map(pin){return valid(pin)?`https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`:'';}
 function directions(pin){return valid(pin)?`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${pin.latitude},${pin.longitude}`)}`:'';}
 function graphic(){return '<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M4 20 22 14 42 20 60 14v38l-18 6-20-6-18 6Z" fill="#DDF3E9" stroke="#12805F" stroke-width="2" stroke-linejoin="round"/><path d="M22 14v38l20 6V20" fill="#BCE4D3" stroke="#12805F" stroke-width="2" stroke-linejoin="round"/><path d="m8 44 11-7 10 7 17-11 10 4" fill="none" stroke="#FFF" stroke-width="4" stroke-linecap="round"/><path d="M44 17c0 8-12 20-12 20S20 25 20 17a12 12 0 1 1 24 0Z" fill="#12805F" stroke="#FFF" stroke-width="2"/><circle cx="32" cy="17" r="4" fill="#FFF"/></svg>';}
 function render(pin,{draft=false}={}){if(!valid(pin))return '';return `<div class="chat-location-card"><a class="chat-location-pin" href="${map(pin)}" target="_blank" rel="noopener noreferrer">${graphic()}<span>${draft?'Location ready to send':'Shared location'}<small>${draft?'Not sent yet. Tap Send to share this pin.':'Open map · location at the time it was sent'}</small></span></a>${draft?'':`<a class="chat-location-directions" href="${directions(pin)}" target="_blank" rel="noopener noreferrer">Get directions</a>`}</div>`;}
 function capture(){return new Promise((resolve,reject)=>{
  if(!navigator.geolocation)return reject(Error('Location is unavailable on this device.'));
  navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude,...(Number.isFinite(position.coords.accuracy)?{accuracy_m:position.coords.accuracy}:{}),captured_at:new Date(position.timestamp).toISOString()}),()=>reject(Error('Allow location access and turn on device location, then retry.')),{enableHighAccuracy:true,maximumAge:0,timeout:12000});
 });}
 root.AtlLocation={valid,map,directions,render,capture};
})(globalThis);
