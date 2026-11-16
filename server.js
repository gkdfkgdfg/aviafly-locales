'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const files=new Set(['index.html','avia-assets-1.js','avia-assets-2.js','avia-assets-3.js','avia-i18n.js','avia-local.js','avia-loader.js','avia-game.js','avia-portal.js','avia-audio.js']);
function createServer(){return http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';}catch{res.writeHead(400).end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  if(!files.has(name)){res.writeHead(404).end('Not found');return;}
  const file=path.join(root,name);fs.stat(file,(error,stat)=>{
    if(error){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(name)],'Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  });
});}
if(require.main===module){const port=Number(process.env.PORT)||3010;createServer().listen(port,'127.0.0.1',()=>console.log('AviaFly: http://127.0.0.1:'+port));}
module.exports={createServer};
