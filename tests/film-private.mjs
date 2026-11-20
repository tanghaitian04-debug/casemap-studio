import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir,mkdtemp,rm,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { startPrivateRender } from '../server/private-render.mjs';
const require=createRequire(import.meta.url),Film=require('../documentary.js'),Pack=require('../film-pack.js');
const token=randomBytes(32).toString('hex');
await mkdir('output',{recursive:true});
const output=await mkdtemp('output/film-api-');
const {server,close}=await startPrivateRender({PORT:'0',CASEMAP_RENDER_TOKEN:token,CASEMAP_JOB_DIR:output});
const url='http://127.0.0.1:'+server.address().port;
const auth={Authorization:'Bearer '+token};
try{
  const example={version:2,title:'私有任务测试',width:1280,fps:24,sources:[],events:[],assets:{},
    scenes:[{...Film.titleScene('test','私有任务测试',1),caption:'自动化测试'}],reviewed:false};
  const submit=async()=>fetch(url+'/api/film/jobs',{method:'POST',headers:{...auth,'Content-Type':'application/zip'},
    body:await Pack.pack(example,new Map())});
  assert.equal((await fetch(url+'/api/film/capabilities')).status,401);
  assert.deepEqual(await (await fetch(url+'/api/film/capabilities',{headers:auth})).json(),{render:true,ai:false,voice:false});
  assert.equal((await submit()).status,400);
  example.reviewed=true;
  const response=await submit();
  assert.equal(response.status,202);
  const {id}=await response.json();
  let status;
  for(let i=0;i<60;i++){
    status=await (await fetch(url+'/api/film/jobs/'+id,{headers:auth})).json();
    if(status.stage==='失败'||status.stage==='已完成')break;
    await delay(350);
  }
  assert.equal(status?.stage,'已完成',status?.error);
  assert.equal((await fetch(url+'/api/film/jobs/'+id+'/video')).status,401);
  const mp4=await fetch(url+'/api/film/jobs/'+id+'/video',{headers:auth});
  const file=output+'/check.mp4';
  await writeFile(file,Buffer.from(await mp4.arrayBuffer()));
  const stream=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file])).streams[0];
  assert.equal(stream.codec_name,'h264');
  assert.equal(stream.r_frame_rate,'24/1');
  assert.equal(Number(stream.nb_frames),24);
  console.log('V2 私有服务：鉴权、审核、上传 ZIP、真实帧数和 MP4 下载通过');
}finally{await close();await rm(output,{force:true,recursive:true});}
