import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const types = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json',
  '.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm',
  '.ktx2':'image/ktx2','.mp4':'video/mp4','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg',
  '.woff2':'font/woff2','.md':'text/plain; charset=utf-8'
};
export async function sendStatic(req,res,directory='dist') {
  const root=resolve(directory);
  try {
    if(req.method!=='GET' && req.method!=='HEAD')throw new Error('Not found');
    const pathname=decodeURI(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+sep) || !Object.hasOwn(types,extname(file)))throw new Error('Not found');
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)],'X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?null:body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}
export async function serve(directory='dist') {
  const server=createServer((req,res)=>sendStatic(req,res,directory));
  await new Promise((resolve,reject)=>{
    server.on('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return {url:'http://127.0.0.1:'+server.address().port, close:()=>new Promise(resolve=>server.close(resolve))};
}
