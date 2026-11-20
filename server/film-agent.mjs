import { createRequire } from 'node:module';
import { writeFile,mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
const require=createRequire(import.meta.url);
const Film=require('../documentary.js');
const statusError=(text)=>Object.assign(new Error(text),{status:422});
const types=['MapScene','ReconstructionScene','FootageScene','ImageScene','TitleScene'];
const segment={type:'object',additionalProperties:false,required:['quote','narration','type','uncertainty'],properties:{
  quote:{type:'string'},narration:{type:'string'},type:{type:'string',enum:types},uncertainty:{type:'string'}
}};
const schema={type:'object',additionalProperties:false,required:['segments'],properties:{segments:{type:'array',items:segment}}};
const shipped=(output)=>output?.flatMap(v=>v.content||[]).find(v=>v.type==='output_text')?.text;

export function applyAgent(project,raw,story) {
  if(!Array.isArray(raw?.segments)||!raw.segments.length||raw.segments.length>12)throw statusError('AI 返回的分镜数量无效');
  const next=structuredClone(project);
  for(const row of raw.segments){
    if(!row||typeof row.quote!=='string'||!row.quote||!story.includes(row.quote)||
      !types.includes(row.type)||typeof row.narration!=='string'||!row.narration||
      typeof row.uncertainty!=='string')throw statusError('AI 分镜含无法对应到案情文字的内容');
    const event=next.events.find(e=>e.action.includes(row.quote)||row.quote.includes(e.action));
    if(!event)continue;
    event.suggested_scene_type=row.type;
    event.review_note=row.uncertainty.slice(0,240);
    const shot=next.scenes.find(s=>s.event===event.event_id);
    if(!shot)continue;
    shot.narration='根据用户提供的资料，'+row.narration.slice(0,780);
    // A model cannot attach a source file to a scene without supplied media.
    if(row.type==='TitleScene')shot.type='TitleScene';
  }
  next.agent='AI 整理 · 对照提供文本 · 待人工复核';
  return Film.validate(next);
}
export async function proposeFilm(data,env) {
  if(!env.OPENAI_API_KEY||!env.CASEMAP_AI_MODEL)throw statusError('服务端未配置 AI 模型');
  const brief=data?.brief;
  if(!brief||typeof brief.story!=='string'||!brief.story.trim()||brief.story.length>4000)throw statusError('请输入 1–4000 字的案情文字');
  const clean={};
  for(const key of ['title','date','country','state','city','address','story','links','requirements','pace']){
    clean[key]=typeof brief[key]==='string'?brief[key].slice(0,4000):'';
  }
  if(Number.isFinite(brief.lat)&&Number.isFinite(brief.lon)){clean.lat=brief.lat;clean.lon=brief.lon;}
  const original=Film.plan(clean,{assets:data.assets,videoDuration:Math.min(180,Number(data.videoDuration)||0),pace:clean.pace});
  const reply=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(50000),body:JSON.stringify({
      model:env.CASEMAP_AI_MODEL,store:false,max_output_tokens:3200,
      instructions:'根据用户提供的案情文字提取最多12条可引用的语句。quote 必须是原文连续子串。按原顺序提供中性中文旁白和建议画面类型。身份、证据、路线、时间、对白均以原文为准，保持待核实。对暴力事件使用文字综述，不生成战术路线或攻击动作指导。uncertainty 记录未核实情况。不得宣称已查阅网页或视频。',
      input:JSON.stringify({story:clean.story,pace:clean.pace,requirements:clean.requirements}),
      text:{format:{type:'json_schema',name:'casemap_film_outline',strict:true,schema}}
    })
  });
  if(!reply.ok)throw statusError('AI 服务返回 HTTP '+reply.status);
  const content=shipped((await reply.json()).output);
  if(!content)throw statusError('AI 未返回可用分镜');
  return applyAgent(original,JSON.parse(content),clean.story);
}

export async function speakFilm(data,env) {
  if(!env.OPENAI_API_KEY||!env.CASEMAP_TTS_MODEL)throw statusError('服务端未配置普通话语音合成');
  const scenes=data?.project?.scenes;
  if(!Array.isArray(scenes)||scenes.length<1||scenes.length>20||scenes.some(s=>!Number.isFinite(s?.duration)||
    s.duration<1||s.duration>180||typeof s.narration!=='string'||s.narration.length>500)||
    scenes.reduce((a,s)=>a+s.duration,0)>180||scenes.reduce((a,s)=>a+s.narration.length,0)>2200)
    throw statusError('单次最多 20 个镜头、180 秒或 2200 字旁白');
  const speed=Number(data.speed??1);
  if(!Number.isFinite(speed)||speed<.85||speed>1.2)throw statusError('语速须在 0.85–1.2 之间');
  const scratch=await mkdtemp(join(tmpdir(),'casemap-voice-'));
  let start=0;
  const inputs=[],filters=[],refs=[];
  try{
    for(const scene of scenes){
      if(scene.narration.trim()){
        const response=await fetch('https://api.openai.com/v1/audio/speech',{
          method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(35000),
          body:JSON.stringify({model:env.CASEMAP_TTS_MODEL,voice:'alloy',input:scene.narration,response_format:'mp3',speed})
        });
        if(!response.ok)throw statusError('配音服务返回 HTTP '+response.status);
        const bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.length<200||bytes.length>12_000_000)throw statusError('配音服务返回内容大小无效');
        const i=refs.length,file=join(scratch,'line-'+i+'.mp3');
        await writeFile(file,bytes);
        const {stdout}=await run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{timeout:15000});
        const seconds=Number(stdout.trim()),tempo=Math.max(1,seconds/scene.duration);
        if(!Number.isFinite(seconds)||tempo>1.65)throw statusError('旁白太长，请减少字数或延长对应镜头');
        inputs.push('-i',file);
        filters.push(`[${i}:a]atempo=${tempo.toFixed(5)},adelay=${Math.round(start*1000)}:all=1[v${i}]`);
        refs.push('[v'+i+']');
      }
      start+=scene.duration;
    }
    if(!refs.length)throw statusError('暂无旁白内容');
    const out=join(scratch,'voice.mp3');
    filters.push(refs.join('')+`amix=inputs=${refs.length}:normalize=0,alimiter,apad[voice]`);
    await run('ffmpeg',['-v','error','-y',...inputs,'-filter_complex',filters.join(';'),'-map','[voice]','-t',String(start),out],{timeout:45000});
    return await readFile(out);
  }finally{await rm(scratch,{recursive:true,force:true});}
}
