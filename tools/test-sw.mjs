import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://example.test/used-to-lab/';
const currentCache='habit-lab-v1-20261102-r1';
const oldCache='habit-lab-v1-20261030-r3';
const url=path=>new URL(path,scope).href;

function worker({files=['kept','missing'],failShell=false,failCopy=false}={}){
  const stores=new Map(),listeners=new Map(),network=[],messages=[];
  let skipped=false,claimed=false;
  const key=request=>typeof request==='string'?request:request.url;
  const seed=(name,entries)=>stores.set(name,new Map(entries.map(([path,body])=>[url(path),new Response(body)])));
  const fetch=async request=>{
    const address=key(request);network.push(address);
    if(failShell&&address===url('app.js'))throw new Error('shell unavailable');
    return new Response(address===url('audio/index.json')?JSON.stringify({files}):`new ${address}`);
  };
  const caches={
    keys:async()=>[...stores.keys()],
    delete:async name=>stores.delete(name),
    open:async name=>{
      if(!stores.has(name))stores.set(name,new Map());
      const store=stores.get(name);
      return {
        match:async request=>store.get(key(request))?.clone(),
        put:async(request,response)=>{
          if(failCopy&&name===currentCache&&key(request).endsWith('.mp3'))throw new Error('audio copy failed');
          store.set(key(request),response.clone());
        },
        addAll:async requests=>{
          const responses=await Promise.all(requests.map(fetch));
          requests.forEach((request,index)=>store.set(key(request),responses[index].clone()));
        }
      };
    }
  };
  const self={registration:{scope},addEventListener:(name,callback)=>listeners.set(name,callback),skipWaiting:async()=>{skipped=true;},clients:{claim:async()=>{claimed=true;},matchAll:async()=>[{url:scope,postMessage:message=>messages.push(message)}]}};
  vm.runInNewContext(source,{self,caches,fetch,URL,Request,Response,AbortSignal});
  return {
    stores,network,messages,seed,
    get skipped(){return skipped;},get claimed(){return claimed;},
    dispatch:async(name,data={})=>{
      let pending;
      listeners.get(name)({...data,waitUntil:promise=>{pending=promise;},respondWith:promise=>{pending=promise;}});
      return pending;
    },
    read:async(name,path)=>stores.get(name)?.get(url(path))?.clone().text()
  };
}

test('shell upgrade keeps current-manifest audio and fetches a fresh shell',async()=>{
  const sw=worker();
  sw.seed(oldCache,[['app.js','old JavaScript'],['audio/kept.mp3','saved Ryan'],['audio/obsolete.mp3','removed clip']]);
  sw.seed('another-app-v1',[['audio/unrelated.mp3','unrelated audio']]);
  await sw.dispatch('install');
  assert.equal(sw.skipped,true);
  assert.equal(await sw.read(currentCache,'audio/kept.mp3'),'saved Ryan');
  assert.equal(await sw.read(currentCache,'audio/obsolete.mp3'),undefined);
  assert.equal(await sw.read(currentCache,'audio/missing.mp3'),undefined);
  assert.equal(await sw.read(currentCache,'app.js'),`new ${url('app.js')}`);
  assert.equal(await sw.read(currentCache,'ui-text.js'),`new ${url('ui-text.js')}`);
  assert.equal(sw.network.some(address=>address.endsWith('.mp3')),false);
  assert.equal(sw.stores.has(oldCache),true,'installation must retain the old cache until activation');
  await sw.dispatch('activate');
  assert.equal(sw.claimed,true);
  assert.equal(sw.stores.has(oldCache),false);
  assert.equal(await sw.read('another-app-v1','audio/unrelated.mp3'),'unrelated audio');
  assert.equal(await sw.read(currentCache,'audio/kept.mp3'),'saved Ryan');
  const response=await sw.dispatch('fetch',{request:new Request(url('audio/kept.mp3'),{headers:{Range:'bytes=0-4'}})});
  assert.equal(response.status,206);
  assert.equal(response.headers.get('Content-Range'),'bytes 0-4/10');
  assert.equal(await response.text(),'saved');
});

test('offline fill downloads missing clips without downloading preserved clips again',async()=>{
  const sw=worker();
  sw.seed(oldCache,[['audio/kept.mp3','saved Ryan']]);
  await sw.dispatch('install');
  await sw.dispatch('activate');
  await sw.dispatch('message',{data:{type:'CACHE_ALL'}});
  assert.equal(sw.network.includes(url('audio/kept.mp3')),false);
  assert.equal(sw.network.filter(address=>address===url('audio/missing.mp3')).length,1);
  assert.equal(await sw.read(currentCache,'audio/kept.mp3'),'saved Ryan');
  assert.equal(sw.messages.at(-1).type,'CACHE_READY');
});

for(const [name,options] of [['shell download',{failShell:true}],['audio migration',{failCopy:true}]]){
  test(`failed ${name} leaves the old worker cache intact`,async()=>{
    const sw=worker(options);
    sw.seed(oldCache,[['app.js','old JavaScript'],['audio/kept.mp3','saved Ryan']]);
    await assert.rejects(sw.dispatch('install'),/unavailable|copy failed/);
    assert.equal(sw.skipped,false);
    assert.equal(sw.claimed,false);
    assert.equal(await sw.read(oldCache,'app.js'),'old JavaScript');
    assert.equal(await sw.read(oldCache,'audio/kept.mp3'),'saved Ryan');
  });
}
