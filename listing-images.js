(function(root){
    'use strict';
    // Only listing photos are transformed; identity/verification documents remain original.
    async function prepare(file){
        if(!file || !/^image\/(jpeg|png|webp|avif)$/i.test(file.type) || file.size<350000)return file;
        let image,objectURL;
        try{
            if(typeof root.createImageBitmap==='function') image=await root.createImageBitmap(file);
            else {objectURL=URL.createObjectURL(file);image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=objectURL;});}
            const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
            if(!width||!height)return file;
            const scale=Math.min(1,1600/Math.max(width,height)),canvas=document.createElement('canvas');
            canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
            const context=canvas.getContext('2d');if(!context)return file;
            context.drawImage(image,0,0,canvas.width,canvas.height);
            const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.82));
            if(!blob||blob.size>=file.size)return file;
            const ext=blob.type==='image/webp'?'webp':blob.type==='image/png'?'png':'jpg';
            return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.'+ext,{type:blob.type,lastModified:file.lastModified});
        }catch{return file;}finally{image?.close?.();if(objectURL)URL.revokeObjectURL(objectURL);}
    }
    root.ListingImages={prepare};
})(typeof window!=='undefined'?window:globalThis);
