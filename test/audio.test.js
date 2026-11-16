'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const audio=require('../avia-audio');
const response=()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});

test('unsupported primary codec falls back to the other embedded format',async()=>{
 const urls=[],buffer={duration:1};let calls=0;
 const context={decodeAudioData(){return ++calls===1?Promise.reject(new Error('codec')):Promise.resolve(buffer)}};
 assert.equal(await audio.load(context,'https://avia.local/a.ogg?v=1',{fetch:async url=>{urls.push(url);return response()}}),buffer);
 assert.deepEqual(urls,['https://avia.local/a.ogg?v=1','https://avia.local/a.aac?v=1']);
});

test('failure of both formats resolves silently instead of leaving startup pending',async()=>{
 assert.equal(await audio.load({decodeAudioData(){return Promise.reject(new Error('codec'))}},'a.aac',{fetch:async()=>response()}),null);
});

test('WebKit callback-only decoding is supported',async()=>{
 const buffer={duration:2};
 assert.equal(await audio.load({decodeAudioData(bytes,accept){queueMicrotask(()=>accept(buffer))}},'a.aac',{fetch:async()=>response()}),buffer);
});

for(const stage of ['fetch','decode'])test('a stalled '+stage+' releases startup within the timeout',async()=>{
 const pending=new Promise(()=>{});let signal;
 const buffer=await audio.load({decodeAudioData(){return pending}},'a.aac',{
  timeoutMs:25,fetch:async(url,options)=>{signal=options.signal;return stage==='fetch'?pending:response()}
 });
 assert.equal(buffer,null);assert.equal(signal.aborted,true);
});

test('engine releases each failed sound exactly once and the loader accepts its settled state',async()=>{
 // Run the actual sound class from the downloaded engine, including its startup accounting.
 const source=fs.readFileSync(path.join(__dirname,'../avia-game.js'),'utf8');
 const start=source.indexOf('      m1 = class {'),end=source.indexOf('      vs =',start);
 const counts={started:0,finished:0};
 const context={window:{AviaAudio:{load:async()=>null}},game:{loadingAdd(){counts.started++},loadingRemove(){counts.finished++}},Ye2:{},Ii2:(object,key,value)=>object[key]=value};
 vm.createContext(context);vm.runInContext('var m1;'+source.slice(start,end),context);
 const sound=new context.m1('a.aac');
 const first=sound.load();assert.equal(first,sound.load(),'duplicate warmup must share one request');
 await first;
 assert.equal(sound.audioBuffer,null);assert.equal(audio.ready(sound),true);
 assert.deepEqual(counts,{started:1,finished:1});
 assert.equal(audio.ready({loadingStarted:true}),false,'essential wait stays pending until completion');
});
