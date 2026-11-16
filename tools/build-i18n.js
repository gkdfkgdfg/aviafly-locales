'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),packs={};
for(const lang of ['pl','sr','cs','it'])packs[lang]=JSON.parse(fs.readFileSync(path.join(root,'locales',lang+'.json'),'utf8'));
const runtime=fs.readFileSync(path.join(root,'i18n-runtime.js'),'utf8').replace('__AVIA_LOCALES__',JSON.stringify(packs));
fs.writeFileSync(path.join(root,'avia-i18n.js'),runtime);
console.log('Built locales:',Object.keys(packs).join(', '));
