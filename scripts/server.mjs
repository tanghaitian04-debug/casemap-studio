import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const types = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm',
  '.ktx2':'image/ktx2','.mp4':'video/mp4','.webm':'video/webm','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg',
  '.woff2':'font/woff2','.md':'text/plain; charset=utf-8'
};
export async function sendStatic(req,res,directory='dist') {
  const root=resolve(directory);
  try {
    if(req.method!=='GET' && req.method!=='HEAD')throw new Error('Not found');
    const pathname=decodeURI(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+sep) || !Object.hasOwn(types,extname(file)))throw new Error('Not found');
    if(['.mp4','.webm','.mp3','.wav','.ogg'].includes(extname(file)))return await media(req,res,file);
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)],'X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?null:body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}
async function media(req,res,file) {
  const {size}=await stat(file);
  let start=0,end=size-1,status=200;
  const headers={'Content-Type':types[extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store'};
  if(req.headers.range){
    const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(!match){res.writeHead(416,{'Content-Range':'bytes */'+size}).end();return;}
    start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;
    if(start>end||start>=size){res.writeHead(416,{'Content-Range':'bytes */'+size}).end();return;}
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length']=end-start+1;
  res.writeHead(status,headers);
  if(req.method==='HEAD'){res.end();return;}
  createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
}
export async function serve(directory='dist',privateMedia=new Map()) {
  const server=createServer(async(req,res)=>{
    const file=privateMedia.get(new URL(req.url,'http://localhost').pathname);
    if(!file)return sendStatic(req,res,directory);
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    try {await media(req,res,file);} catch {res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{
    server.on('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return {url:'http://127.0.0.1:'+server.address().port, close:()=>new Promise(resolve=>server.close(resolve))};
}
