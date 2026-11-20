import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir,mkdtemp,rm,writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { startPrivateRender } from '../server/private-render.mjs';
import { toProject } from '../server/ai.mjs';

const require=createRequire(import.meta.url);
const format=require('../project.js');
const token=randomBytes(32).toString('hex');
await mkdir('output',{recursive:true});
const directory=await mkdtemp('output/api-check-');
const {server,close}=await startPrivateRender({CASEMAP_RENDER_TOKEN:token,PORT:'0',CASEMAP_JOB_DIR:directory});
const url='http://127.0.0.1:'+server.address().port;
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
try {
  assert.equal((await fetch(url+'/api/capabilities')).status,401);
  assert.deepEqual(await (await fetch(url+'/api/capabilities',{headers})).json(),{render:true,ai:false});
  assert.equal((await fetch(url+'/api/jobs',{method:'POST',headers,body:'{"project":{}}'})).status,400);
  const project={...format.empty(),duration:1.2,fps:24};
  const queued=await fetch(url+'/api/jobs',{method:'POST',headers,body:JSON.stringify({project})});
  assert.equal(queued.status,202);
  const job=await queued.json();
  assert.equal(job.stage,'queued');
  const path=url+'/api/jobs/'+job.id;
  assert.equal((await fetch(path+'/video')).status,401);
  let status;
  for(let i=0;i<45;i++){
    status=await (await fetch(path,{headers})).json();
    if(['done','failed'].includes(status.stage))break;
    await delay(350);
  }
  assert.equal(status.stage,'done',status.error);
  const video=await fetch(path+'/video',{headers});
  assert.equal(video.status,200);
  const disk=directory+'/test.mp4';
  await writeFile(disk,Buffer.from(await video.arrayBuffer()));
  const stream=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',disk])).streams[0];
  assert.equal(stream.codec_name,'h264');
  assert.equal(stream.r_frame_rate,'24/1');
  assert.equal(Number(stream.nb_frames),29);
  assert.equal((await fetch(url+'/output/private-jobs/'+job.id+'/project.json')).status,404);
  const draft=toProject({events:[
    {id:'car',name:'车辆',kind:'car',action:'move',caption:'车辆驶离',uncertainty:'路径待核实'},
    {id:'car',name:'车辆',kind:'car',action:'stop',caption:'车辆停下',uncertainty:'时间待核实'}
  ]});
  assert.equal(draft.actors.length,1);
  assert.match(draft.subtitle,/待核实/);
  assert.throws(()=>toProject({events:[{id:'bad'}]}),/结构/);
  console.log('私有 API：拒绝未授权请求、校验上传、真实任务、MP4 下载、AI 结构校验通过');
} finally {
  await close();
  await rm(directory,{recursive:true,force:true});
}
