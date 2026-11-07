(function(root){
 function lines(plan){const p=plan.post_policy,result=[];if(Number.isInteger(plan.listing_limit))result.push(plan.listing_limit+' listings across products and services');if(!p)return result;
 result.push(p.max_images+' images per listing');result.push(p.max_videos?'Up to '+p.max_videos+' videos, '+p.max_video_seconds+' seconds each':'No videos');
 result.push(p.town_hall?(p.town_hall_room_limit===undefined?'Town Hall included':'Join up to '+p.town_hall_room_limit+' Town Hall requests at once'):'Provider Town Hall participation unavailable');
 if(p.town_hall_search)result.push('Town Hall search, category and location filters');if(p.direct_messaging)result.push('Direct customer messaging');if(p.recommended)result.push('Eligible for relevant Recommended listings');
 result.push(String(p.visibility||'').replace(/_/g,' ')+' promoted exposure'+(p.promotional_weight?' (relative weight '+p.promotional_weight+')':''));return result;}
 function usage(u){return u?[u.tier_label+': '+u.active_listings_used+' / '+u.benefits.post_limit+' listing places used; '+u.remaining_active_listings+' available.',u.town_hall_rooms_used+' / '+u.benefits.town_hall_room_limit+' Town Hall requests joined; '+u.remaining_town_hall_rooms+' available.',...(u.listing_over_limit||u.room_over_limit?['Your existing listings, media and joined requests are kept. Reduce usage or upgrade before adding more.']:[])]:[];}
 root.ProviderTierBenefits={lines,usage,explanation:'Business verification is required. Your badge shows your paid plan, not a separate guarantee of trust or transport licensing. Promotion depends on relevance, availability and fair rotation. No plan guarantees inquiries, sales or a search position.'};
})(window);
