(function(root){
 'use strict';
 const definitions={
  super_admin:{label:'Super Admin',description:'Full administration, staff access and final payout approval.',tabs:['overview','providers','service-moderation','product-moderation','subscriptions','promotions','xp-withdrawals','admins','support','community','analytics','complaints','waitlist','merchant-fulfillments','orders','transactions']},
  catalog_admin:{label:'Marketplace Admin (broad)',description:'Legacy combined marketplace moderation and support access.',tabs:['overview','providers','service-moderation','product-moderation','subscriptions','promotions','merchant-fulfillments','orders','transactions','support','community','analytics','complaints']},
  support_admin:{label:'Support',description:'Customer/provider support tickets and replies. No payout or staff management.',tabs:['support']},
  moderation_admin:{label:'Moderation',description:'Provider verification, listing approval, reports and complaints.',tabs:['providers','service-moderation','product-moderation','community','complaints']},
  finance_admin:{label:'Finance',description:'Withdrawal preparation/rejection and transaction records. Super Admin confirms completed payouts.',tabs:['xp-withdrawals','transactions']},
  ads_admin:{label:'Advertising',description:'Promoted-listing performance reports. Campaign editing is not enabled yet.',tabs:['promotions']}
 };
 const api={definitions,tabs:role=>[...(definitions[role]?.tabs||[])],label:role=>definitions[role]?.label||'Unknown role'};
 root.AtlAdminRoles=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
