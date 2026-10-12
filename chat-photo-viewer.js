(() => {
 const dialog=document.createElement("dialog");dialog.className="chat-photo-viewer";dialog.setAttribute("aria-label","Chat photo");
 dialog.innerHTML=`<div class="photo-toolbar"><button type="button" data-photo-close>Close</button><span>Photo</span><button type="button" data-photo-reset>Reset</button></div><div class="photo-canvas"><img alt="Chat attachment" draggable="false"><p class="photo-status" role="status"></p></div><div class="photo-toolbar"><button type="button" data-photo-out aria-label="Zoom out">-</button><span>Pinch or double tap to zoom</span><button type="button" data-photo-in aria-label="Zoom in">+</button></div>`;
 document.body.append(dialog);
 const canvas=dialog.querySelector(".photo-canvas"),image=dialog.querySelector("img"),status=dialog.querySelector(".photo-status"),points=new Map();
 let scale=1,x=0,y=0,start=null,focus=null,lastTap=0,moved=false;
 function apply(next=scale,nextX=x,nextY=y){scale=Math.max(1,Math.min(5,next));const fit=Math.min(canvas.clientWidth/(image.naturalWidth||1),canvas.clientHeight/(image.naturalHeight||1));const maxX=Math.max(0,((image.naturalWidth||1)*fit*scale-canvas.clientWidth)/2),maxY=Math.max(0,((image.naturalHeight||1)*fit*scale-canvas.clientHeight)/2);x=Math.max(-maxX,Math.min(maxX,nextX));y=Math.max(-maxY,Math.min(maxY,nextY));image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;}
 function reset(){start=null;points.clear();apply(1,0,0);}
 function zoom(next,point={x:0,y:0}){next=Math.max(1,Math.min(5,next));const ratio=next/scale;apply(next,point.x-(point.x-x)*ratio,point.y-(point.y-y)*ratio);}
 function measure(){const values=[...points.values()],a=values[0],b=values[1]||a;return {count:values.length,x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};}
 canvas.addEventListener("pointerdown",event=>{if(event.button!==0)return;canvas.setPointerCapture(event.pointerId);points.set(event.pointerId,{x:event.clientX,y:event.clientY});start={...measure(),scale,xOffset:x,yOffset:y};moved=false;});
 canvas.addEventListener("pointermove",event=>{if(!points.has(event.pointerId))return;points.set(event.pointerId,{x:event.clientX,y:event.clientY});const current=measure();if(!start||start.count!==current.count){start={...current,scale,xOffset:x,yOffset:y};return;}if(Math.hypot(current.x-start.x,current.y-start.y)>4||current.count>1)moved=true;const next=current.count>1&&start.distance?Math.max(1,Math.min(5,start.scale*current.distance/start.distance)):start.scale;const bounds=canvas.getBoundingClientRect(),anchor={x:start.x-bounds.left-bounds.width/2,y:start.y-bounds.top-bounds.height/2},ratio=next/start.scale;apply(next,anchor.x-(anchor.x-start.xOffset)*ratio+current.x-start.x,anchor.y-(anchor.y-start.yOffset)*ratio+current.y-start.y);
 });
 function release(event){points.delete(event.pointerId);if(!moved&&event.type==="pointerup"){const now=Date.now();if(now-lastTap<300){zoom(scale>1?1:2.5);lastTap=0;}else lastTap=now;}start=points.size?{...measure(),scale,xOffset:x,yOffset:y}:null;}
 canvas.addEventListener("pointerup",release);canvas.addEventListener("pointercancel",release);
 canvas.addEventListener("wheel",event=>{event.preventDefault();const bounds=canvas.getBoundingClientRect();zoom(scale*(event.deltaY<0?1.2:1/1.2),{x:event.clientX-bounds.left-bounds.width/2,y:event.clientY-bounds.top-bounds.height/2});},{passive:false});
 dialog.querySelector("[data-photo-close]").onclick=()=>dialog.close();dialog.querySelector("[data-photo-reset]").onclick=reset;dialog.querySelector("[data-photo-in]").onclick=()=>zoom(scale*1.5);dialog.querySelector("[data-photo-out]").onclick=()=>zoom(scale/1.5);
 dialog.addEventListener("close",()=>{if(history.state?.providerPhoto)history.back();image.removeAttribute("src");reset();focus?.focus();});
 image.onload=()=>{status.textContent="";apply();};image.onerror=()=>{status.textContent="Photo could not be loaded. Close and reopen it to try again.";};
 document.addEventListener("click",event=>{const button=event.target.closest("[data-chat-photo]");if(!button)return;event.preventDefault();const url=new URL(button.dataset.chatPhoto,location.href);if(url.protocol!=="https:"&&url.protocol!=="http:")return;focus=button;reset();status.textContent="Loading photo...";image.src=url.href;dialog.showModal();history.pushState({...history.state,providerPhoto:true},"",location.href);});
 window.addEventListener("popstate",()=>{if(dialog.open)dialog.close();});
 window.addEventListener("resize",()=>apply());
})();
