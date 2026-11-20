import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseBrief } from './ai.mjs';
import { proposeFilm,speakFilm } from './film-agent.mjs';
import { sendStatic } from '../scripts/server.mjs';

const require=createRequire(import.meta.url);
const {validate}=require('../project.js');
const FilmPack=require('../film-pack.js');
const sha=text=>createHash('sha256').update(text).digest();
const json=(res,status,data)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(data));
const stages=new Set(['preparing','rendering','encoding','verifying']);
const limit=48_000_000;
const retention=12*60*60*1000;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

async function rawBody(req,max,type) {
  if(req.headers['content-type']?.split(';')[0]!==type)throw fail('上传格式须为 '+type,415);
  if(Number(req.headers['content-length'])>max)throw fail('上传超过大小限制',413);
  let size=0;
  const parts=[];
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>max)throw fail('上传超过大小限制',413);
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
async function jsonBody(req,max){
  const bytes=await rawBody(req,max,'application/json');
  try{return JSON.parse(bytes.toString('utf8'));}
  catch{throw fail('项目 JSON 无法读取');}
}
function verifyMedia(project) {
  const refs=[project.map.image,...project.actors.map(a=>a.avatar).filter(Boolean),
    ...(project.audio||[]).map(a=>a.source)];
  for(const ref of refs) {
    if(ref.startsWith('data:') || ref==='assets/demo-map.jpg'||ref==='assets/demo-map.webp'||ref==='assets/earth.webp')continue;
    throw fail('上传项目包含未嵌入的外部素材。请先通过编辑器导入素材。');
  }
}

export async function startPrivateRender(env=process.env) {
  const token=env.CASEMAP_RENDER_TOKEN||'';
  if(token.length<32)throw new Error('CASEMAP_RENDER_TOKEN 必须是至少 32 字符的随机密钥');
  const allowedOrigin=env.CASEMAP_EDITOR_ORIGIN||'';
  if(allowedOrigin && (new URL(allowedOrigin).origin!==allowedOrigin || !allowedOrigin.startsWith('https://')))
    throw new Error('请将 CASEMAP_EDITOR_ORIGIN 设为 HTTPS 来源，不含路径');
  const tokenHash=sha(token);
  const directory=resolve(env.CASEMAP_JOB_DIR||'output/private-jobs');
  if(!directory.startsWith(resolve('output')+'/'))throw new Error('任务目录必须在 output 下');
  await mkdir(directory,{recursive:true,mode:0o700});
  const jobs=new Map(),queue=[];
  const authorized=req=>timingSafeEqual(tokenHash,sha((req.headers.authorization||'').replace(/^Bearer /,'')||' '));
  let running=false, child, aiBusy=false;
  const cleanup=async job=>{
    jobs.delete(job.id);
    await rm(job.directory,{recursive:true,force:true});
  };
  const cleanupTimer=setInterval(()=>{
    for(const job of jobs.values())if(job.expiresAt && job.expiresAt<Date.now())void cleanup(job).catch(()=>{});
  },60_000).unref();
  function killChild() {
    if(!child?.pid)return;
    try { process.kill(-child.pid,'SIGTERM'); } catch {}
  }
  async function work() {
    if(running || !queue.length)return;
    running=true;
    const job=queue.shift();
    job.stage='preparing';
    const timeout=setTimeout(()=>{
      job.error='任务超过 20 分钟，已终止';killChild();
    },20*60*1000);
    try{
      await new Promise((complete,reject)=>{
        const launch=job.mode==='film'?['scripts/render-film.mjs']:['scripts/render.mjs','--native'];
        child=spawn(process.execPath,[...launch,'--project',job.input,'--output',job.file],
          {detached:true,stdio:['ignore','pipe','pipe']});
        let lines='',errors='';
        child.stdout.setEncoding('utf8').on('data',chunk=>{
          lines+=chunk;
          let end;
          while((end=lines.indexOf('\n'))>=0){
            const line=lines.slice(0,end);lines=lines.slice(end+1);
            if(job.mode==='film'){
              if(line.startsWith('READY '))job.stage='rendering';
              const progress=/^FRAME (\d+) (\d+)$/.exec(line);
              if(progress){job.frames=Number(progress[1]);job.total=Number(progress[2]);job.stage='rendering';}
              if(line.startsWith('VERIFIED '))job.stage='verifying';
            }
            if(!line.startsWith('CASEMAP_PROGRESS '))continue;
            try{
              const p=JSON.parse(line.slice('CASEMAP_PROGRESS '.length));
              if(stages.has(p.stage)){job.stage=p.stage;job.frames=p.frames;job.total=p.total;}
            }catch{}
          }
        });
        child.stderr.setEncoding('utf8').on('data',chunk=>{errors=(errors+chunk).slice(-1200);});
        child.once('error',reject);
        child.once('close',code=>{
          if(code===0)complete();
          else reject(new Error(job.error || (errors.includes('无法读取场景图片')?'图片素材无法解码':
            errors.includes('ffprobe')?'MP4 元数据校验失败':'渲染器退出（代码 '+code+'）')));
        });
      });
      const video=await stat(job.file);
      if(!video.size)throw new Error('渲染文件为空');
      job.stage='done';
    } catch(error) {job.stage='failed';job.error=error.message;}
    finally{
      await rm(job.input,{force:true}).catch(()=>{});
      job.expiresAt=Date.now()+retention;
      clearTimeout(timeout);
      running=false;
      child=null;
      void work();
    }
  }
  const server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(!path.startsWith('/api/')){
        await sendStatic(req,res,'dist');
        return;
      }
      res.setHeader('Cache-Control','no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Vary','Origin');
      if(allowedOrigin && req.headers.origin===allowedOrigin){
        res.setHeader('Access-Control-Allow-Origin',allowedOrigin);
        res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      }
      if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
      if(!authorized(req)){json(res,401,{error:'访问密钥无效'});return;}
      if(path==='/api/film/capabilities' && req.method==='GET'){
        json(res,200,{render:true,ai:Boolean(env.OPENAI_API_KEY&&env.CASEMAP_AI_MODEL),
          voice:Boolean(env.OPENAI_API_KEY&&env.CASEMAP_TTS_MODEL)});return;
      }
      if((path==='/api/film/plan'||path==='/api/film/voice') && req.method==='POST'){
        if(aiBusy)throw fail('已有 AI 处理正在运行',429);
        const data=await jsonBody(req,64_000);
        if(aiBusy)throw fail('已有 AI 处理正在运行',429);
        aiBusy=true;
        try{
          if(path.endsWith('plan'))json(res,200,{project:await proposeFilm(data,env)});
          else {
            const sound=await speakFilm(data,env);
            res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':sound.length}).end(sound);
          }
        }catch(error){throw fail(error.message,422);}
        finally{aiBusy=false;}
        return;
      }
      if(path==='/api/capabilities' && req.method==='GET'){
        json(res,200,{render:true,ai:Boolean(env.OPENAI_API_KEY&&env.CASEMAP_AI_MODEL)});return;
      }
      if(path==='/api/parse' && req.method==='POST'){
        if(aiBusy)throw fail('已有 AI 解析正在运行',429);
        const {brief}=await jsonBody(req,24_000);
        aiBusy=true;
        try {json(res,200,{project:await parseBrief(brief,env)});}
        catch(error){throw fail(error.message,422);}
        finally{aiBusy=false;}
        return;
      }
      if((path==='/api/jobs'||path==='/api/film/jobs')&&req.method==='POST'){
        if(queue.length>=4 || jobs.size>=16)throw fail('任务队列已满，请稍后再试',429);
        const mode=path==='/api/film/jobs'?'film':'map';
        let payload;
        if(mode==='film'){
          payload=await rawBody(req,110_000_000,'application/zip');
          try{
            const {project}=await FilmPack.unpack(payload);
            if(!project.reviewed)throw Error('请先审核影片');
          }catch(error){throw fail(error.message);}
        } else {
          const {project}=await jsonBody(req,limit);
          try{validate(project);verifyMedia(project);}catch(error){throw fail(error.message);}
          payload=JSON.stringify(project);
        }
        if(queue.length>=4 || jobs.size>=16)throw fail('任务队列已满，请稍后再试',429);
        const id=randomUUID(), dir=join(directory,id);
        const job={id,mode,directory:dir,input:join(dir,mode==='film'?'project.zip':'project.json'),file:join(dir,'video.mp4'),stage:'queued'};
        jobs.set(id,job);
        try{
          await mkdir(dir,{mode:0o700});
          await writeFile(job.input,payload,{mode:0o600,flag:'wx'});
        } catch(error){await cleanup(job);throw error;}
        queue.push(job);
        json(res,202,{id,stage:job.stage});
        void work();
        return;
      }
      const match=/^\/api\/(film\/)?jobs\/([a-f0-9-]{36})(\/video)?$/.exec(path);
      const job=match&&jobs.get(match[2]);
      if(!job || (match[1]?'film':'map')!==job.mode || req.method!=='GET'){json(res,404,{error:'任务不存在或已过期'});return;}
      if(match[3]){
        if(job.stage!=='done'){json(res,409,{error:'视频尚未完成'});return;}
        const size=(await stat(job.file)).size;
        res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,
          'Content-Disposition':'attachment; filename="'+basename(job.file)+'"'});
        createReadStream(job.file).on('error',()=>res.destroy()).pipe(res);
        return;
      }
      const filmStages={queued:'等待中',preparing:'准备素材',rendering:'渲染画面',verifying:'校验成片',done:'已完成',failed:'失败'};
      json(res,200,{stage:job.mode==='film'?filmStages[job.stage]:job.stage,frames:job.frames,total:job.total,error:job.error});
    } catch(error) {
      if(res.headersSent){res.destroy();return;}
      json(res,error.status||500,{error:error.status?error.message:'服务器无法完成请求'});
    }
  });
  server.requestTimeout=90_000;
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(Number(env.PORT??8787),env.HOST||'127.0.0.1',resolve);
  });
  return {server, close:()=>{clearInterval(cleanupTimer);killChild();return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const {server,close}=await startPrivateRender();
  console.log('CaseMap private server listening on '+server.address().port);
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await close();process.exit(0);});
}
