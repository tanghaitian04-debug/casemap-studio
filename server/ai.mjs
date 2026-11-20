import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const format=require('../project.js');
const kinds=['officer','suspect','person','civilian','car'];
const actions=['move','stop','appear','notice'];
const stage={
  type:'object',additionalProperties:false,required:['id','name','kind','action','caption','uncertainty'],
  properties:{
    id:{type:'string'}, name:{type:'string'},kind:{type:'string',enum:kinds},
    action:{type:'string',enum:actions},caption:{type:'string'},uncertainty:{type:'string'}
  }
};
const schema={type:'object',additionalProperties:false,required:['events'],
  properties:{events:{type:'array',items:stage}}};

export function toProject(value) {
  if(!Array.isArray(value?.events) || value.events.length<1 || value.events.length>24)
    throw new Error('AI 事件数量不符合项目要求');
  const project=format.empty();
  project.title='案件动画草稿';
  project.subtitle='AI 整理 · 时间、路径及身份待核实';
  project.intro.duration=5;
  project.duration=Math.max(16,6+4*value.events.length);
  const actors=new Map();
  for(const [i,item] of value.events.entries()) {
    if(!item || Object.keys(item).length!==stage.required.length || !stage.required.every(key=>typeof item[key]==='string') ||
      !kinds.includes(item.kind) || !actions.includes(item.action) || !/^[a-z0-9_-]{1,30}$/i.test(item.id) ||
      !item.name.trim() || !item.caption.trim())
      throw new Error('AI 事件结构无效');
    const t=5+i*4;
    if(!actors.has(item.id))actors.set(item.id,{id:item.id,name:item.name.slice(0,30),kind:item.kind,
      points:[{t,x:.28+actors.size%4*.05,y:.78-Math.floor(actors.size/4)*.09}],color:item.kind==='car'?'#ed8b63':'#52d1fa'});
    const actor=actors.get(item.id);
    if(actor.kind!==item.kind)throw new Error('AI 事件对象类型不一致');
    const last=actor.points.at(-1);
    if(last.t<t)actor.points.push({t,x:last.x,y:last.y,ease:'hold'});
    if(item.action==='move')actor.points.push({t:t+3.6,x:Math.min(.85,last.x+.12),y:Math.max(.15,last.y-.03),ease:'smooth'});
    if(item.action==='notice')project.events.push({t:t+1,actor:actor.id,type:'alert',duration:1.1});
    project.captions.push({start:t,end:t+3.8,text:'示意 · '+item.caption.slice(0,76)});
    project.camera.push({t,x:.5,y:.65,zoom:1.08,rotation:0,
      ...(item.action==='move'?{target:actor.id}:{})});
  }
  project.actors=[...actors.values()];
  project.scriptNotes=value.events.map((event,i)=>({event:i+1,note:event.uncertainty.slice(0,250)}));
  return format.validate(project);
}

export async function parseBrief(brief,env=process.env) {
  if(!env.OPENAI_API_KEY || !env.CASEMAP_AI_MODEL)throw new Error('管理员尚未配置 AI 服务');
  if(typeof brief!=='string' || !brief.trim() || brief.length>5000)throw new Error('案件描述须在 5000 字符内');
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(45000),body:JSON.stringify({
      model:env.CASEMAP_AI_MODEL,store:false,max_output_tokens:3600,
      instructions:'按先后顺序将用户明确描述的事件拆分为最多24条简体中文示意动画事件。给同一对象使用一致的 ASCII id。不得推断或编造实际身份、地理位置、路线、确切时间或其他未被提供的事实。使用中性表述。uncertainty 说明描述中尚待核实的信息。仅生成一般动画动作（移动、停止、出现、注意），未知过程保持示意。',
      input:brief,text:{format:{type:'json_schema',name:'casemap_script',strict:true,schema}}
    })
  });
  if(!response.ok)throw new Error('AI 请求失败（HTTP '+response.status+'）');
  const data=await response.json();
  const content=data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text');
  if(!content?.text)throw new Error('AI 没有返回可用脚本');
  return toProject(JSON.parse(content.text));
}
