import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { serve } from './server.mjs';

const require = createRequire(import.meta.url);
const { validate } = require('../project.js');
const { values } = parseArgs({ options:{
  project:{type:'string',default:'examples/demo.json'},output:{type:'string'},seconds:{type:'string'},
  width:{type:'string'},fps:{type:'string'},filename:{type:'string'},check:{type:'boolean'},
  'report-dir':{type:'string',default:'output'}
}});
const path = await realpath(values.project);
if (!path.startsWith(resolve('.')+sep) || !path.endsWith('.json')) throw new Error('项目必须是仓库内的 JSON 文件');
const project = validate(JSON.parse(await readFile(path,'utf8')));
if (values.check) {
  console.log('项目校验通过：'+project.title);
  process.exit(0);
}
if (values.width) {
  const width=Number(values.width);
  project.size=[width,width*9/16];
}
if (values.fps) project.fps=Number(values.fps);
validate(project);
const seconds=values.seconds ? Number(values.seconds) : project.duration;
if (!Number.isFinite(seconds) || seconds<=0 || seconds>180) throw new Error('渲染时长须在 0–180 秒内');
const count=Math.round(seconds*project.fps);
if (!count) throw new Error('时长不足一帧');
const [width,height]=project.size;
const name=(values.filename || project.outputName || 'case-map.mp4').trim().replace(/\.mp4$/i,'');
if (!name || name==='.' || name==='..' || /[\\/\u0000-\u001f]/.test(name) || name.length>75) throw new Error('无效的视频文件名');
const output=resolve(values.output || join(values['report-dir'],name+'.mp4'));
if (!output.endsWith('.mp4')) throw new Error('视频输出文件须使用 .mp4');
await mkdir(dirname(output),{recursive:true});
const scratch=await mkdtemp(join(tmpdir(),'casemap-frames-'));
const temporary=join(dirname(output),'.casemap-'+process.pid+'.mp4');
const server=await serve();
let browser, ffmpeg;
try {
  browser=await chromium.launch({executablePath:process.env.CASEMAP_CHROMIUM || undefined});
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(server.url+'/render.html');
  await page.evaluate(scene=>window.prepareScene(scene),project);
  const args=['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(project.fps),'-vcodec','mjpeg','-i','pipe:0'];
  for (const [i,clip] of (project.audio||[]).entries()) {
    let file;
    if (clip.source.startsWith('data:')) {
      file=join(scratch,'audio-'+i);
      await writeFile(file,Buffer.from(clip.source.split(',')[1],'base64'));
    } else {
      file=resolve('dist',clip.source);
      await access(file);
    }
    args.push('-i',file);
  }
  if (project.audio?.length) {
    const filters=project.audio.map((clip,i)=>`[${i+1}:a]adelay=${Math.round(clip.start*1000)}:all=1,volume=${clip.gain??1}[a${i}]`);
    const inputs=project.audio.map((_,i)=>`[a${i}]`).join('');
    filters.push(inputs+`amix=inputs=${project.audio.length}:normalize=0,alimiter,apad[aout]`);
    args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[aout]','-c:a','aac','-b:a','192k');
  }
  args.push('-t',String(count/project.fps),'-c:v','libx264','-preset','veryfast','-crf','19',
    '-pix_fmt','yuv420p','-movflags','+faststart',temporary);
  ffmpeg=spawn('ffmpeg',args,{stdio:['pipe','ignore','inherit']});
  ffmpeg.stdin.on('error',()=>{});
  const done=once(ffmpeg,'close').then(([code])=>{if(code!==0)throw new Error('FFmpeg 编码失败：'+code);});
  done.catch(()=>{});
  const batch=8;
  for (let i=0;i<count;i+=batch) {
    const frames=await page.evaluate(({i,length,fps})=>window.renderFrames(i,length,fps),
      {i,length:Math.min(batch,count-i),fps:project.fps});
    for (const frame of frames) {
      if (!ffmpeg.stdin.write(Buffer.from(frame,'base64'))) await Promise.race([once(ffmpeg.stdin,'drain'),done]);
    }
    if (i===0 || i%120===0) console.log(`逐帧渲染 ${Math.min(i+batch,count)}/${count}`);
  }
  ffmpeg.stdin.end();
  await done;
  const report=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',temporary]));
  const stream=report.streams.find(s=>s.codec_type==='video');
  if (!stream || stream.codec_name!=='h264' || stream.width!==width || stream.height!==height ||
      stream.r_frame_rate!==project.fps+'/1' || Number(stream.nb_read_frames)!==count) throw new Error('ffprobe 视频校验失败');
  await rename(temporary,output);
  report.format.filename=basename(output);
  await writeFile(output+'.ffprobe.json',JSON.stringify(report,null,2)+'\n');
  console.log(`${basename(output)} · H.264 · ${width}×${height} · ${project.fps} fps · ${count} 帧`);
} finally {
  if (ffmpeg && ffmpeg.exitCode===null) ffmpeg.kill();
  await browser?.close();
  await server.close();
  await rm(temporary,{force:true});
  await rm(scratch,{force:true,recursive:true});
}
