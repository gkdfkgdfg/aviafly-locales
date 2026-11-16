'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),code=fs.readFileSync(path.join(root,'avia-i18n.js'),'utf8');
const assets={};for(const n of [1,2,3]){const source=fs.readFileSync(path.join(root,'avia-assets-'+n+'.js'),'utf8');Object.assign(assets,JSON.parse(source.slice(source.indexOf('{},')+3,source.lastIndexOf(');'))));}
function boot(query='',stored=''){
 const win={__OPTIONS__:{locale:'es'},__AVIA_ASSETS__:{...assets}},events={};
 const doc={documentElement:{},head:{appendChild(){}},createElement(){return {}},addEventListener(name,fn){events[name]=fn}};
 const context={window:win,document:doc,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,atob,btoa,location:{href:'https://example.com/sub/'+query,search:query},localStorage:{getItem(){return stored}}};
 vm.runInNewContext(code,context);return {i18n:win.AviaI18n,win,doc};
}
for(const lang of ['pl','sr','cs','it'])test(lang+': translates settings, rules, portal, loader and engine errors without changing currency',()=>{
 const {i18n,win,doc}=boot('?lang='+lang),pack=i18n.pack;
 assert.equal(i18n.lang,lang);assert.equal(doc.documentElement.lang,lang);assert.equal(win.__OPTIONS__.locale,lang);
 assert.equal(pack.rules.length,6);assert.equal(pack.portal.names.length,3);assert.equal(pack.tips.length,5);
 const hud=i18n.hud('images/');assert.ok(hud.settings.includes(pack.how));assert.ok(hud.settings.includes('data-v="fx"'));
 assert.equal(i18n.status('Сохранено'),pack.saved);
 assert.ok(i18n.settingsMarkup('<div class="fp-wallet-row">Валюта</div>').includes(pack.currency));
 const entry=win.__AVIA_ASSETS__['shared/translations/LocalAviaGame/'+lang+'.json'];
 const engine=JSON.parse(Buffer.from(entry[1],'base64').toString('utf8'));
 assert.equal(engine.errors['301'],pack.funds);assert.equal(engine.localaviagame.altitude,pack.altitude);
 assert.equal(win.__OPTIONS__.currency,undefined,'language selection never changes wallet currency');
});
test('URL language overrides saved preference; saved preference survives new URLs; invalid language falls back',()=>{
 assert.equal(boot('?lang=cs','pl').i18n.lang,'cs');assert.equal(boot('','sr').i18n.lang,'sr');assert.equal(boot('?lang=it-IT').i18n.lang,'it');assert.equal(boot('?lang=unknown').i18n.lang,'en');assert.equal(boot().i18n.lang,'es');
});

test('every selectable language has an embedded engine dictionary, including the Russian launch URL',()=>{
 const {i18n}=boot();
 for(const lang of Object.keys(i18n.names)){
  const {win}=boot('?lang='+lang);
  const entry=win.__AVIA_ASSETS__['shared/translations/LocalAviaGame/'+lang+'.json'];
  assert.ok(entry,'missing embedded engine dictionary for '+lang);
  const engine=JSON.parse(Buffer.from(entry[1],'base64').toString('utf8'));
  assert.ok(engine.panel.balance);
  if(lang==='ru')assert.equal(engine.panel.balance,'Баланс');
 }
});
test('all new locale files have the same complete structure and preserve source game amounts',()=>{
 const flatten=o=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?flatten(v).map(p=>k+'.'+p):[k]).sort();
 const packs=['pl','sr','cs','it'].map(lang=>JSON.parse(fs.readFileSync(path.join(root,'locales',lang+'.json'),'utf8')));
 for(const p of packs){assert.deepEqual(flatten(p),flatten(packs[0]));assert.ok(p.rules.join('').includes('96%'));assert.ok(p.rules.join('').includes('10 000'));}
});
test('static server serves a repository subdirectory-independent client and hides private files',async()=>{
 const server=require('../server').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/?lang=pl')).status,200);assert.equal((await fetch(base+'/avia-i18n.js')).status,200);
  assert.equal((await fetch(base+'/.git/config')).status,404);assert.equal((await fetch(base+'/server.js')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
