import { createRequire } from 'node:module';
import { mkdtemp,readFile,writeFile,rm,mkdir } from 'node:fs/promises';
import { join,dirname,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { renderVideo } from './browser-video.mjs';
const require=createRequire(import.meta.url);
const Film=require('../documentary.js');
const Pack=require('../film-pack.js');
const {values}=parseArgs({options:{
  project:{type:'string',default:'examples/film-demo.json'},
  output:{type:'string',default:'output/casemap-v2-demo.mp4'}, smoke:{type:'boolean'}
}});
const buffer=await readFile(values.project);
const loaded=values.project.endsWith('.zip')?await Pack.unpack(buffer):{project:JSON.parse(buffer),blobs:new Map()};
const project=Film.validate(loaded.project.version===1?Film.migrate(loaded.project):loaded.project);
const scratch=await mkdtemp(join(tmpdir(),'casemap-film-'));
const directory=dirname(resolve(values.output));
await mkdir(directory,{recursive:true});
const duration=Film.sequence(project.scenes).at(-1).end;
const urls=Object.create(null),media=new Map(),inputs=new Map();
const ffmpeg=(args)=>execFileSync('ffmpeg',['-hide_banner','-v','error','-y',...args],{stdio:['ignore','ignore','inherit'],timeout:180_000});
const probe=(file)=>JSON.parse(execFileSync('ffprobe',['-v','error','-protocol_whitelist','file,pipe,data','-show_streams','-show_format','-of','json',file],{timeout:25000}));
try {
  for(const [id,asset] of Object.entries(project.assets)){
    const input=asset.builtin?resolve(asset.builtin):join(scratch,id+'.asset');
    if(!asset.builtin){
      const blob=loaded.blobs.get(id);
      if(!blob)throw Error('缺少素材 '+asset.name+'。包含外部素材的影片需提交 ZIP。');
      await writeFile(input,Buffer.from(await blob.arrayBuffer()));
    }
    const streams=probe(input);
    inputs.set(id,{file:input,hasAudio:streams.streams.some(s=>s.codec_type==='audio')});
    if(asset.kind==='audio')continue;
    const ext=asset.kind==='video'?'.webm':'.png';
    const file=join(scratch,id+ext);
    if(asset.kind==='video'){
      // Normalize video so Chromium can read permitted uploads regardless of host codecs.
      ffmpeg(['-protocol_whitelist','file,pipe,data','-i',input,'-map','0:v:0','-an','-t','180',
        '-vf','scale=min(1920\\,iw):-2','-c:v','libvpx','-threads','4','-deadline','realtime','-cpu-used','7','-crf','13','-b:v','4M',file]);
    } else ffmpeg(['-protocol_whitelist','file,pipe,data','-i',input,'-frames:v','1','-vf','scale=min(1920\\,iw):-1',file]);
    urls[id]='/__film/'+id+ext;media.set(urls[id],file);
  }
  let audio;
  const parts=Film.sequence(project.scenes).filter(s=>s.type==='FootageScene'&&inputs.get(s.asset)?.hasAudio)
    .map(s=>({file:inputs.get(s.asset).file,start:s.start,in:s.in,duration:s.duration,volume:(s.gain??1)*(project.voice?.trim()?0.3:1)}));
  if(project.voice){
    const voice=inputs.get(project.voice);
    if(!voice?.hasAudio)throw Error('旁白素材没有音轨');
    parts.push({file:voice.file,start:0,in:0,duration,volume:1});
  }
  if(parts.length){
    audio=join(scratch,'mix.wav');
    const args=[],filters=[],refs=[];
    parts.forEach((p,i)=>{
      args.push('-protocol_whitelist','file,pipe,data','-i',p.file);
      const name='a'+i;
      filters.push(`[${i}:a]atrim=start=${p.in}:duration=${p.duration},asetpts=PTS-STARTPTS,volume=${p.volume},adelay=${Math.round(p.start*1000)}:all=1[${name}]`);
      refs.push('['+name+']');
    });
    filters.push(refs.join('')+`amix=inputs=${parts.length}:normalize=0,alimiter,apad[mix]`);
    ffmpeg([...args,'-filter_complex',filters.join(';'),'-map','[mix]','-t',String(duration),audio]);
  }
  const count=values.smoke?project.scenes.length:Math.round(duration*project.fps);
  const shots=Film.sequence(project.scenes);
  const report=await renderVideo({
    pagePath:'film-render.html',width:project.width,height:project.width*9/16,fps:project.fps,count,output:values.output,
    audio:values.smoke?undefined:audio,privateMedia:media,
    setup:page=>page.evaluate(({project,urls})=>window.prepareFilm(project,urls),{project,urls}),
    frame:(page,t)=>page.evaluate(at=>window.filmFrame(at),values.smoke?shots[Math.round(t*project.fps)].start+.5:t)
  });
  await writeFile(values.output+'.ffprobe.json',JSON.stringify(report,null,2)+'\n');
  await Promise.all([
    writeFile(join(directory,'storyboard.json'),JSON.stringify(Film.storyboard(project),null,2)+'\n'),
    writeFile(join(directory,'events.json'),JSON.stringify(project.events,null,2)+'\n'),
    writeFile(join(directory,'subtitles.srt'),Film.srt(project)),
    writeFile(join(directory,'narration-zh.txt'),Film.narration(project)),
    writeFile(join(directory,'sources.json'),JSON.stringify({sources:project.sources,assets:project.assets},null,2)+'\n'),
    writeFile(join(directory,'editable-film.json'),JSON.stringify(project,null,2)+'\n'),
    writeFile(join(directory,'editable-film.zip'),await Pack.pack(project,loaded.blobs))
  ]);
} finally {await rm(scratch,{recursive:true,force:true});}
