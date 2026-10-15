(function(root){
 'use strict';
 function valid(pin){return !!pin&&Number.isFinite(pin.latitude)&&Number.isFinite(pin.longitude)&&Math.abs(pin.latitude)<=90&&Math.abs(pin.longitude)<=180;}
 function map(pin){return valid(pin)?`https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`:'';}
 function render(pin){if(!valid(pin))return '';return `<a class="chat-location-pin" href="${map(pin)}" target="_blank" rel="noopener noreferrer">📍 Shared location<small>Open in maps · static pin</small></a>`;}
 function capture(){return new Promise((resolve,reject)=>{
  if(!navigator.geolocation)return reject(Error('Location is unavailable on this device.'));
  navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude,...(Number.isFinite(position.coords.accuracy)?{accuracy_m:position.coords.accuracy}:{}),captured_at:new Date(position.timestamp).toISOString()}),()=>reject(Error('Allow location access and turn on device location, then retry.')),{enableHighAccuracy:true,maximumAge:0,timeout:12000});
 });}
 root.AtlLocation={valid,map,render,capture};
})(globalThis);
