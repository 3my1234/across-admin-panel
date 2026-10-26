// Verify every local asset referenced by the actual provider HTML exists in its Docker image.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync('provider.html','utf8');
const paths=[...new Set([...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)].map(m=>m[1]).filter(p=>p.startsWith('./')).map(p=>p.slice(2).split('?')[0]))];
assert.ok(paths.includes('provider-tier-benefits.js'));
assert.ok(paths.includes('provider-promotions.js'));
const copies=new Set(fs.readFileSync('Dockerfile.provider','utf8').split(/\r?\n/).filter(line=>line.startsWith('COPY ')).flatMap(line=>line.trim().split(/\s+/).slice(1,-1)));
for(const path of paths){assert.ok(copies.has(path),'Missing provider image COPY for '+path);assert.ok(fs.existsSync(path),'Missing source asset '+path);}
async function verify(){
 if(process.env.PROVIDER_IMAGE_ASSET_ORIGIN){
  const base=new URL(process.env.PROVIDER_IMAGE_ASSET_ORIGIN);
  assert.ok(['127.0.0.1','localhost'].includes(base.hostname),'Use an isolated local image');
  for(const path of paths){const response=await fetch(new URL(path,base));assert.equal(response.status,200,path+' must be served by the provider image');const actual=Buffer.from(await response.arrayBuffer()),expected=fs.readFileSync(path);assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),crypto.createHash('sha256').update(expected).digest('hex'),path+' must match reviewed source');}
 }
 console.log('Provider image asset coverage passed for '+paths.length+' referenced assets'+(process.env.PROVIDER_IMAGE_ASSET_ORIGIN?' with exact HTTP content':' (source/COPY preflight; image HTTP check runs in CI)')+'.');
}
verify().catch(error=>{console.error(error);process.exitCode=1;});
