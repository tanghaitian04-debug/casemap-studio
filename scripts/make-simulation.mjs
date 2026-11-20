import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
require('../engine.js');
GlobalFonts.loadFontsFromDir('/usr/share/fonts/opentype/noto');
const w=640,h=360;
const canvas=createCanvas(w,h);
const engine=new globalThis.CaseMapEngine.Engine(canvas,{createCanvas:()=>createCanvas(1,1),loadImage:ref=>loadImage(ref)});
const project=JSON.parse(await readFile('examples/demo.json','utf8'));
project.events=[];project.captions=[];project.subtitle='原创动画 · 模拟机位';project.show_tracks=false;
project.camera=[{t:0,x:.39,y:.69,zoom:1.45,rotation:10}];
engine.setProject(project);
await engine.ready();
const encoder=spawn('ffmpeg',['-hide_banner','-v','error','-y','-f','image2pipe','-framerate','24','-vcodec','mjpeg','-i','pipe:0',
  '-f','lavfi','-i','anoisesrc=color=brown:amplitude=0.008:sample_rate=48000:seed=127','-filter_threads','1','-vf','eq=saturation=0.35:contrast=1.13','-c:v','libx264','-threads','2','-crf','34',
  '-c:a','aac','-b:a','36k','-shortest','-pix_fmt','yuv420p','-movflags','+faststart','assets/simulation.mp4'],{stdio:['pipe','inherit','inherit']});
const result=once(encoder,'close');
const ctx=canvas.getContext('2d');
for(let frame=0;frame<24*21;frame++){
  engine.render(8+frame/24);
  ctx.fillStyle='#08121de8';ctx.fillRect(16,278,235,42);
  ctx.fillStyle='#fff';ctx.font='600 16px "Noto Sans CJK SC", sans-serif';ctx.fillText('原创模拟录像 · 虚构',27,304);
  ctx.fillStyle='#ff686c';ctx.beginPath();ctx.arc(600,24,4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='12px sans-serif';ctx.fillText('CAM A  /  00:'+String(Math.floor(frame/24)).padStart(2,'0'),482,29);
  if(!encoder.stdin.write(canvas.toBuffer('image/jpeg',82)))await once(encoder.stdin,'drain');
}
encoder.stdin.end();
const [code]=await result;
if(code!==0)throw Error('模拟素材编码失败');
