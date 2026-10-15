const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const g={URL,location:{origin:'https://provider.atlxpres.com'}};vm.createContext(g);vm.runInContext(fs.readFileSync('provider-identity.js','utf8'),g);
const render=g.ProviderIdentity.render;
for(const tier of ['bronze','silver','gold','diamond']){
 const identity={name:'Sample provider',verified:true,paid_active:true,tier};
 const html=render(identity);assert.match(html,/data-provider-badge/);assert.match(html,new RegExp(tier[0].toUpperCase()+tier.slice(1)+' subscription'));assert.doesNotMatch(html,/class="provider-seal-shimmer"/);
 assert.match(render(identity,{animate:true}),/class="provider-seal-shimmer"/);
 assert.notEqual(html,render(identity),'SVG gradient IDs must be unique');
}
assert.match(render({name:'Free',verified:true,paid_active:false,tier:'gold'}),/Free plan/);
assert.doesNotMatch(render({name:'Pending',verified:false,paid_active:true,tier:'diamond'}),/data-provider-badge/);
assert.doesNotMatch(render({name:'<script>bad<\/script>',avatar_url:'javascript:alert(1)'}),/<script>|<img/);
assert.match(render({name:'Avatar',avatar_url:'https://example.com/avatar.jpg'}),/<img/);
assert.match(g.ProviderIdentity.banner({name:'Provider',banner_url:'https://example.com/banner.jpg'}),/provider-business-banner/);
assert.equal(g.ProviderIdentity.banner({banner_url:'javascript:alert(1)'}),'');
assert.equal(g.ProviderIdentity.banner({banner_url:'data:image/svg+xml,bad'}),'');
assert.doesNotMatch(g.ProviderIdentity.banner({name:'<script>bad</script>',banner_url:'https://example.com/banner.jpg'}),/<script>/);
assert.match(fs.readFileSync('provider-identity.css','utf8'),/prefers-reduced-motion/);
console.log('Provider badges passed: four tiers, free/expired, unverified, unique SVG IDs, escaping, static lists and reduced motion.');
