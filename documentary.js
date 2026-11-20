(function(root){
  'use strict';
  const Flight=typeof module==='object'?require('./flight.js'):root.CaseMapFlight;
  const Project=typeof module==='object'?require('./project.js'):root.CaseMapProject;
  const Geo=typeof module==='object'?require('./geo.js'):root.CaseMapGeo;
  const types=['GlobeScene','MapScene','ReconstructionScene','FootageScene','ImageScene','TitleScene'];
  const statuses=['unverified','inferred','illustrative','verified'];
  const assetId=/^[a-z0-9_-]{1,50}$/;
  const bounded=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
  const limited=(v,n)=>typeof v==='string'&&v.length<=n;
  const demand=(ok,message)=>{if(!ok)throw Error(message);};
  function text(value,len=180){return String(value??'').trim().slice(0,len);}
  function publicURL(value) {
    try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password;}catch{return false;}
  }
  function sequence(scenes) {
    let start=0;
    return scenes.map(scene=>{const result={...scene,start,end:start+scene.duration};start=result.end;return result;});
  }
  function at(project,time) {
    const shots=sequence(project.scenes);
    const index=Math.max(0,shots.findLastIndex(shot=>shot.start<=time));
    const scene=shots[index];
    return {scene,index,local:Math.max(0,Math.min(scene.duration,time-scene.start))};
  }
  function validate(p) {
    demand(p?.version===2&&limited(p.title,160),'影片项目版本或标题无效');
    demand([24,30,60].includes(p.fps)&&[1280,1920].includes(p.width),'影片分辨率或帧率无效');
    demand(Array.isArray(p.sources)&&p.sources.length<=60,'资料表无效');
    const sourceIDs=new Set();
    for(const item of p.sources){
      demand(assetId.test(item?.id)&&!sourceIDs.has(item.id)&&limited(item.title,160)&&limited(item.notes,4000)&&
        limited(item.published,40)&&limited(item.occurred,40)&&statuses.includes(item.status)&&
        (!item.url||publicURL(item.url)),'资料来源无效');
      sourceIDs.add(item.id);
    }
    const linked=refs=>Array.isArray(refs)&&refs.length<=30&&refs.every(id=>sourceIDs.has(id));
    demand(Array.isArray(p.events)&&p.events.length<=60,'事件表无效');
    const eventIDs=new Set();
    for(const event of p.events){
      demand(assetId.test(event?.event_id)&&!eventIDs.has(event.event_id)&&limited(event.action,500)&&
        limited(event.location,220)&&Array.isArray(event.actors)&&event.actors.length<=12&&event.actors.every(a=>limited(a,60))&&
        linked(event.evidence)&&bounded(event.confidence,0,1)&&statuses.includes(event.verification_status)&&
        types.includes(event.suggested_scene_type)&&statuses.includes(event.route_status),'事件字段或证据引用无效');
      demand((event.start_time===null||bounded(event.start_time,0,86400))&&(event.end_time===null||
        (event.start_time!==null&&bounded(event.end_time,event.start_time,86400))),'事件时间无效');
      if(event.verification_status==='verified')demand(event.evidence.length&&event.evidence.some(id=>p.sources.find(s=>s.id===id).status==='verified'),'已核实事件须关联已核实来源');
      eventIDs.add(event.event_id);
    }
    demand(p.assets&&typeof p.assets==='object'&&!Array.isArray(p.assets)&&Object.keys(p.assets).length<=32,'影片素材索引无效');
    for(const [id,asset] of Object.entries(p.assets)){
      demand(assetId.test(id)&&['video','image','audio'].includes(asset?.kind)&&limited(asset.name,150)&&
        limited(asset.credit,200)&&Boolean(asset.credit.trim())&&asset.rights===true&&
        (asset.builtin===undefined || (id==='simulation'&&asset.builtin==='assets/simulation.mp4'&&asset.kind==='video') ||
          (id==='public-park'&&asset.builtin==='assets/geo/orlando-park.webp'&&asset.kind==='image')),'素材索引、版权或署名无效');
    }
    demand(Array.isArray(p.scenes)&&p.scenes.length>=1&&p.scenes.length<=60,'分镜数量无效');
    const sceneIDs=new Set();
    for(const s of p.scenes){
      demand(assetId.test(s?.id)&&!sceneIDs.has(s.id)&&types.includes(s.type)&&bounded(s.duration,1,180)&&
        limited(s.title,140)&&limited(s.narration,900)&&limited(s.caption,240)&&linked(s.evidence)&&
        (s.event===null||eventIDs.has(s.event))&&['cut','fade'].includes(s.transition),'分镜字段或证据链接无效');
      sceneIDs.add(s.id);
      if(s.subtitleCues)demand(Array.isArray(s.subtitleCues)&&s.subtitleCues.length<=28&&
        s.subtitleCues.every(c=>bounded(c.start,0,s.duration)&&bounded(c.end,c.start,s.duration)&&limited(c.text,240)),'字幕时间码无效');
      if(s.type==='GlobeScene')Flight.validate(s.flight,s.duration);
      if(['MapScene','ReconstructionScene'].includes(s.type)){
        Project.validate(s.map);
        demand(bounded(s.in,0,s.map.duration),'地图片段的入点无效');
      }
      if(s.type==='FootageScene'||s.type==='ImageScene'){
        const required=s.type==='FootageScene'?'video':'image';
        demand(p.assets[s.asset]?.kind===required&&bounded(s.in,0,14400)&&bounded(s.zoom,.5,4)&&
          bounded(s.x,-1,1)&&bounded(s.y,-1,1)&&bounded(s.gain??1,0,2),'分镜素材、裁切或构图无效');
        if(s.mask)demand(['x','y','w','h'].every(k=>bounded(s.mask[k],0,1))&&s.mask.x+s.mask.w<=1.0001&&s.mask.y+s.mask.h<=1.0001,'遮罩坐标无效');
        if(s.arrow)demand(['x','y'].every(k=>bounded(s.arrow[k],0,1)),'指示箭头位置无效');
      }
    }
    demand(sequence(p.scenes).at(-1).end<=180,'影片总长不能超过 180 秒');
    if(p.voice)demand(p.assets[p.voice]?.kind==='audio','旁白素材无效');
    if(p.reviewed!==undefined)demand(typeof p.reviewed==='boolean','审核状态无效');
    return p;
  }
  const titleScene=(id,title,duration=5)=>({id,type:'TitleScene',title,duration,caption:'',narration:'',evidence:[],event:null,transition:'fade'});
  function migrate(v1) {
    Project.validate(v1);
    return validate({version:2,title:v1.title,fps:[24,30,60].includes(v1.fps)?v1.fps:30,width:v1.size[0],
      sources:[],events:[],assets:{},fictional:false,reviewed:false,
      scenes:[{...titleScene('map',v1.title,v1.duration),type:'MapScene',in:0,map:v1}]});
  }
  function lines(description){
    return text(description,8000).split(/[。！？；\n]+/).map(s=>s.trim()).filter(Boolean).slice(0,12);
  }
  function symbolicMap(title,event) {
    const p=Project.empty();
    p.title=title;
    p.subtitle='无精确轨迹 · 位置关系示意';
    p.show_tracks=true;p.map.credit='原创示意底图 · 与实际地点无关';
    if(!/开枪|枪击|枪战|枪口|袭击|突袭|射击|伏击/.test(event.action)){
      const vehicle=/车|停车|驶/.test(event.action);
      p.actors=[{id:'subject',kind:vehicle?'car':'person',name:vehicle?'车辆示意':'位置示意',
        ...(vehicle?{vehicle:'sedan'}:{}),color:'#5bd3f5',label:true,
        points:[{t:0,x:.34,y:.68},{t:7,x:.57,y:.68,ease:'smooth'}]}];
    }
    return Project.validate(p);
  }
  function plan(brief,options={}) {
    const title=text(brief.title,160)||'未命名案件';
    const location=[text(brief.state),text(brief.city),text(brief.address)].filter(Boolean).join(' · ').slice(0,220);
    const notes=text(brief.story,4000);
    const sources=[{id:'brief',title:'用户提供的资料',published:'',occurred:text(brief.date,40),url:'',notes,status:'unverified'}];
    for(const url of text(brief.links,3200).split(/\s+/).filter(publicURL).slice(0,10)){
      sources.push({id:'link-'+sources.length,title:'待查阅的资料链接',notes:'链接已登记，正文与事实待人工核验',published:'',occurred:'',url,status:'unverified'});
    }
    const events=lines(notes).map((action,i)=>{
      const map=/抵达|到达|驶离|追逐|停车|路线|位置|车辆/.test(action);
      return {event_id:'event-'+(i+1),start_time:null,end_time:null,location,actors:[],action:text(action,500),
        evidence:['brief'],confidence:.35,verification_status:'unverified',route_status:'illustrative',
        suggested_scene_type:map?'ReconstructionScene':'TitleScene'};
    });
    const assets=options.assets||{};
    const p={version:2,title,fps:30,width:1920,sources,events,assets,reviewed:false,fictional:false,
      scenes:[],brief:{title,date:text(brief.date,40),country:text(brief.country,70),state:text(brief.state,70),
        city:text(brief.city,70),address:text(brief.address,160),requirements:text(brief.requirements,800),story:notes}};
    const lead=titleScene('opening',title,options.pace==='calm'?8:6);
    lead.caption=location||'地点待核实';
    lead.narration='本片根据提供的资料整理。地点和事件时间以可核实的来源为准。';
    const city=Geo.findCity(text(brief.state),text(brief.city));
    const confirmed=bounded(brief.lat,-85,85)&&bounded(brief.lon,-180,180);
    if(confirmed||city) {
      const lat=confirmed?brief.lat:city[2], lon=confirmed?brief.lon:city[3];
      const label=confirmed?(location||lat.toFixed(4)+', '+lon.toFixed(4)):(text(brief.city)||city[1])+' · 城市中心示意';
      lead.type='GlobeScene';lead.duration=10;lead.flight=Flight.preset(lat,lon,10,label);
      if(!confirmed)lead.caption='城市中心示意 · 具体地点待核实';
    }
    p.scenes.push(lead);
    let usedVideo=false;
    const video=Object.keys(assets).find(id=>assets[id].kind==='video');
    const photo=Object.keys(assets).find(id=>assets[id].kind==='image');
    for(const [i,e] of events.entries()){
      const shot={...titleScene('shot-'+(i+1),'事件 '+(i+1),options.pace==='calm'?9:7),transition:'cut',
        evidence:e.evidence,event:e.event_id,caption:text('据提供资料 · '+e.action,110),
        narration:'据提供的资料，'+e.action+'。具体时间与细节待核实。'};
      if(video&&!usedVideo&&options.videoDuration>=1){
        usedVideo=true;Object.assign(shot,{type:'FootageScene',asset:video,in:0,
          duration:Math.min(shot.duration,options.videoDuration),x:0,y:0,zoom:1,caption:'用户上传素材 · 对应事件待核实'});
        e.suggested_scene_type=shot.type;
      } else if(e.suggested_scene_type==='ReconstructionScene' && !/开枪|枪击|枪战|枪口|袭击|伏击|射击/.test(e.action)){
        Object.assign(shot,{type:'ReconstructionScene',map:options.map||symbolicMap(title,e),in:0,caption:'路径示意 · '+text(e.action,75)});
      } else if(photo&&i===events.length-1){
        Object.assign(shot,{type:'ImageScene',asset:photo,in:0,x:0,y:0,zoom:1,caption:'用户提供的资料图片'});
      }
      p.scenes.push(shot);
    }
    const close=titleScene('end','事件资料与核实',6);
    close.caption='时间、身份与路线请以有来源的记录为准';
    close.narration='现有资料能够说明事件的大致经过。缺少证据的细节仍待核实。';
    p.scenes.push(close);
    return validate(p);
  }
  function stamp(value){
    const ms=Math.round(value*1000), p=(n,l=2)=>String(n).padStart(l,'0');
    return p(Math.floor(ms/3600000))+':'+p(Math.floor(ms/60000)%60)+':'+p(Math.floor(ms/1000)%60)+','+p(ms%1000,3);
  }
  function captions(project){
    return sequence(project.scenes).flatMap(s=>{
      if(s.subtitleCues?.length)return s.subtitleCues.map(c=>({start:s.start+c.start,end:s.start+c.end,text:c.text}));
      return s.caption?[{start:s.start,end:s.end,text:s.caption}]:[];
    });
  }
  function srt(project){
    return captions(project).map((cue,i)=>[i+1,stamp(cue.start)+' --> '+stamp(cue.end),cue.text].join('\n')).join('\n\n')+'\n';
  }
  function narration(project){return sequence(project.scenes).map(s=>stamp(s.start)+'  '+s.title+'\n'+s.narration).join('\n\n')+'\n';}
  function storyboard(project){return sequence(project.scenes).map(({map,...shot})=>({...shot,...(map?{mapVersion:map.version}:{})}));}
  function pipeline(project) {
    return [
      ['资料登记',project.sources.length?'ready':'missing'],['证据时间线',project.events.length?'ready':'missing'],
      ['地理定位',project.scenes.some(s=>s.type==='GlobeScene')?'ready':'pending'],['分镜',project.scenes.length?'ready':'pending'],
      ['旁白与字幕',project.scenes.some(s=>s.narration)?'ready':'pending'],['人工审核',project.reviewed?'ready':'pending'],
      ['配音',project.voice?'ready':'pending']
    ];
  }
  const api={types,statuses,sequence,at,validate,migrate,plan,srt,narration,captions,storyboard,pipeline,titleScene};
  if(typeof module==='object')module.exports=api;
  else root.CaseMapDocumentary=api;
})(globalThis);
