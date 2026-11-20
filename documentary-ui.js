(function(){
  'use strict';
  const $=id=>document.getElementById(id),Film=window.CaseMapDocumentary,Pack=window.CaseMapFilmPack;
  const labels={GlobeScene:'Cesium 地理镜头',MapScene:'地图',ReconstructionScene:'二维示意',FootageScene:'视频素材',ImageScene:'资料图片',TitleScene:'文字镜头'};
  const statusLabels={unverified:'待核实',inferred:'推断',illustrative:'示意',verified:'已核实'};
  const fields=['title','date','country','state','city','address','story','links','requirements','pace'];
  let project, files=new Map(), urls=new Map(), selected=0, time=0, playing=false, needsPrepare=true, drawRequested=false, drawActive=false;
  let draftTimer,editor,editableShot,connection,job,jobOrigin,monitorAudio;
  let uploadAssets={},pendingFiles=new Map();
  const message=text=>{$('status').textContent=text;};
  const compiler=new window.CaseMapFilmRenderer.FilmRenderer($('preview'),$('geo-preview'),(id,asset)=>urls.get(id)||asset.builtin);
  const freshId=prefix=>prefix+'-'+crypto.randomUUID().slice(0,12);
  function storage() {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open('casemap-documentary',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('films');
      req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
    });
  }
  async function restore() {
    const db=await storage();
    try{return await new Promise((resolve,reject)=>{
      const request=db.transaction('films').objectStore('films').get('current');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });}finally{db.close();}
  }
  async function save() {
    if(!project)return;
    const db=await storage();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction('films','readwrite');
      tx.objectStore('films').put({project,files:[...files]},'current');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });}finally{db.close();}
  }
  const persist=()=>{clearTimeout(draftTimer);draftTimer=setTimeout(()=>save().catch(()=>message('浏览器草稿保存失败，请下载 ZIP。')),230);};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)void save().catch(()=>{});});
  function el(tag,text,css){
    const n=document.createElement(tag);
    if(text!==undefined)n.textContent=text;
    if(css)n.className=css;
    return n;
  }
  function button(label,fn){const n=el('button',label);n.type='button';n.onclick=fn;return n;}
  function input(label,value,apply,kind='text',options={}) {
    const box=el('label',label), field=el(kind==='select'?'select':kind==='textarea'?'textarea':'input');
    if(kind==='select')for(const [key,name] of options.list)field.add(new Option(name,key));
    else if(kind!=='textarea')field.type=kind;
    field.value=value??'';
    if(kind==='number'){field.step='any';field.inputMode='decimal';}
    if(options.maxlength)field.maxLength=options.maxlength;
    field.onchange=()=>{
      const next=kind==='number'?(field.value.trim()?field.valueAsNumber:null):field.value;
      try{apply(next);}catch(error){field.value=value??'';message(error.message);}
    };
    box.append(field);return box;
  }
  function edit(doEdit,rerender=true) {
    if(!project)return;
    const next=structuredClone(project);
    doEdit(next);
    next.reviewed=false;
    Film.validate(next);
    project=next;needsPrepare=true;persist();
    if(rerender)refresh();
  }
  function syncUrls(){
    for(const url of urls.values())URL.revokeObjectURL(url);
    urls=new Map([...files].map(([id,blob])=>[id,URL.createObjectURL(blob)]));
  }
  function use(next,blobs=new Map()) {
    Film.validate(next);stop();project=next;files=new Map(blobs);syncUrls();
    uploadAssets={...next.assets};pendingFiles=new Map(files);
    $('assets').textContent=Object.values(uploadAssets).map(s=>s.name).join(' · ');
    const brief=next.brief||{};
    for(const id of fields)if(id!=='pace')$(id).value=brief[id]??(id==='title'?next.title:id==='country'?'美国':'');
    $('links').value=next.sources.map(s=>s.url).filter(Boolean).join('\n');
    time=0;selected=0;needsPrepare=true;refresh();persist();paint();
  }
  function second(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t)%60).padStart(2,'0');}
  function paint() {
    if(!project)return;
    drawRequested=true;
    if(drawActive)return;
    drawActive=true;
    void (async()=>{
      while(drawRequested){
        drawRequested=false;
        try {
          if(needsPrepare){const target=project;await compiler.prepare(target);needsPrepare=target!==project;}
          if(needsPrepare){drawRequested=true;continue;}
          const total=Film.sequence(project.scenes).at(-1).end;
          time=Math.min(time,total-.001);
          const data=await compiler.draw(time,{realtime:playing});
          $('clock').textContent=second(time)+' / '+second(total);
          $('seek').value=time;
          if(!playing&&data.type==='GlobeScene')message(data.aerial?'奥兰多航拍图层已就绪':'当地仅有全球影像。近景可导入获许可的本地底图。');
        }catch(error){stop();message('预览暂不可用 · '+error.message);}
      }
    })().finally(()=>{drawActive=false;if(drawRequested)paint();});
  }
  function stop(){playing=false;monitorAudio?.pause();$('play').textContent='播放草稿';}
  function startVoice(){
    const source=urls.get(project?.voice);
    if(!source)return;
    monitorAudio?.pause();
    monitorAudio=new Audio(source);
    monitorAudio.currentTime=time;
    monitorAudio.play().catch(()=>message('浏览器暂未允许播放旁白，成片仍会合成音轨。'));
  }
  function seek(t){stop();time=t;paint();}
  function refresh(){
    if(!project)return;
    const shots=Film.sequence(project.scenes);
    $('seek').max=shots.at(-1).end;
    $('resolution').value=project.width;$('fps').value=project.fps;$('reviewed').checked=Boolean(project.reviewed);
    $('render-budget').textContent='当前任务约 '+Math.round(shots.at(-1).end*project.fps).toLocaleString()+
      ' 帧。内置地理影像不发起计费请求。私有主机、AI 和配音按配置服务计费。';
    $('pipeline').replaceChildren(...Film.pipeline(project).map(([name,state])=>{
      const indicator=el('span',name+' · '+({ready:'就绪',pending:'待处理',missing:'缺少资料'}[state]));
      indicator.dataset.status=state;return indicator;
    }));
    $('sources').replaceChildren(...project.sources.map((s,i)=>{
      const row=el('details'), head=el('summary',s.title+' · '+statusLabels[s.status]);
      row.append(head,
        input('资料标题',s.title,v=>edit(p=>p.sources[i].title=v)),
        input('发布时间',s.published,v=>edit(p=>p.sources[i].published=v)),
        input('事件时刻 / 日期',s.occurred,v=>edit(p=>p.sources[i].occurred=v)),
        input('资料地址',s.url,v=>edit(p=>p.sources[i].url=v)),
        input('引文摘要与核实备注',s.notes,v=>edit(p=>p.sources[i].notes=v),'textarea'),
        input('来源状态',s.status,v=>edit(p=>p.sources[i].status=v),'select',{list:Object.entries(statusLabels)}));
      if(s.url){const link=el('a','在新标签打开资料');link.href=s.url;link.rel='noopener noreferrer';link.target='_blank';row.append(link);}
      return row;
    }));
    $('events').replaceChildren(...project.events.map((e,i)=>{
      const row=el('details'),update=(k,v)=>edit(p=>p.events[i][k]=v);
      row.append(el('summary',e.action+' · '+statusLabels[e.verification_status]),
        input('事件描述',e.action,v=>update('action',v),'textarea'),
        input('实际开始秒数',e.start_time,v=>update('start_time',v),'number'),
        input('实际结束秒数',e.end_time,v=>update('end_time',v),'number'),
        input('地点',e.location,v=>update('location',v)),
        input('人物标签（逗号分隔）',e.actors.join(', '),v=>update('actors',v.split(/[,，]/).map(s=>s.trim()).filter(Boolean))),
        input('事件核实状态',e.verification_status,v=>update('verification_status',v),'select',{list:Object.entries(statusLabels)}),
        input('路线可信状态',e.route_status,v=>update('route_status',v),'select',{list:Object.entries(statusLabels)}),
        input('建议镜头',e.suggested_scene_type,v=>update('suggested_scene_type',v),'select',{list:Object.entries(labels)}));
      const sources=el('div');
      for(const item of project.sources){
        const tag=el('label',item.title,'check'), check=el('input');check.type='checkbox';check.checked=e.evidence.includes(item.id);
        check.onchange=()=>{try{update('evidence',check.checked?[...e.evidence,item.id]:e.evidence.filter(id=>id!==item.id));}catch(error){check.checked=!check.checked;message(error.message);}};
        tag.prepend(check);sources.append(tag);
      }
      row.append(sources);return row;
    }));
    $('shots').replaceChildren(...shots.map((s,i)=>{
      const row=el('details');row.open=i===selected;
      const head=el('summary',second(s.start)+' · '+labels[s.type]+' · '+s.title);
      const update=(fn,refreshUI=true)=>{selected=i;edit(p=>fn(p.scenes[i]),refreshUI);};
      row.append(head,
        input('镜头名称',s.title,v=>update(shot=>shot.title=v)),
        input('时长（秒）',s.duration,d=>update(shot=>{
          if(!Number.isFinite(d))throw Error('请输入镜头时长');
          if(shot.flight)shot.flight.frames.forEach(k=>k.t*=d/shot.duration);
          shot.duration=d;
        }),'number'),
        input('字幕',s.caption,v=>update(shot=>shot.caption=v),'textarea'),
        input('旁白',s.narration,v=>update(shot=>shot.narration=v),'textarea'),
        input('转场',s.transition,v=>update(shot=>shot.transition=v),'select',{list:[['cut','硬切'],['fade','淡入']]}));
      if(s.type==='GlobeScene'){
        const flight=el('details');flight.append(el('summary','地理镜头关键帧'));
        const fields=el('div',undefined,'actions');
        for(const [id,name] of [['arrival','地理推进'],['orbit','建筑环绕'],['pullback','拉远']])
          fields.append(button(name,()=>update(shot=>shot.flight=CaseMapFlight.preset(s.flight.lat,s.flight.lon,s.duration,s.flight.label,id))));
        flight.append(fields);
        s.flight.frames.forEach((frame,j)=>{
          const fields=el('div',undefined,'fields');
          for(const [k,name] of [['t','时间'],['lat','纬度'],['lon','经度'],['height','高度（米）'],['heading','朝向'],['pitch','俯仰']])
            fields.append(input(name,frame[k],v=>update(shot=>shot.flight.frames[j][k]=v,false),'number'));
          fields.append(input('缓动',frame.ease,v=>update(shot=>shot.flight.frames[j].ease=v,false),'select',
            {list:[['linear','匀速'],['smooth','平滑'],['in','缓入'],['out','缓出']]}));
          flight.append(fields);
        });
        row.append(flight);
      }
      if(s.type==='FootageScene'||s.type==='ImageScene'){
        const fields=el('div',undefined,'fields');
        for(const [key,title] of [['in','素材入点（秒）'],['zoom','构图缩放'],['x','横向偏移'],['y','纵向偏移'],['gain','素材音量']])
          fields.append(input(title,s[key]??1,v=>update(shot=>shot[key]=v,false),'number'));
        row.append(fields);
        row.append(button(s.mask?'移除裁切遮罩':'添加裁切遮罩',()=>update(shot=>{
          if(shot.mask)delete shot.mask;else shot.mask={x:.05,y:.05,w:.9,h:.9};
        })));
        if(s.mask)for(const [key,label] of [['x','遮罩左边'],['y','遮罩上边'],['w','遮罩宽度'],['h','遮罩高度']])
          row.append(input(label,s.mask[key],v=>update(shot=>shot.mask[key]=v,false),'number'));
        row.append(button(s.arrow?'移除指示箭头':'添加指示箭头',()=>update(shot=>{
          if(shot.arrow)delete shot.arrow;else shot.arrow={x:.55,y:.52};
        })));
        if(s.arrow)for(const [key,label] of [['x','箭头横向位置'],['y','箭头纵向位置']])
          row.append(input(label,s.arrow[key],v=>update(shot=>shot.arrow[key]=v,false),'number'));
      }
      if(s.type==='MapScene'||s.type==='ReconstructionScene'){
        const items=el('div',undefined,'actions');
        const preset=(name,style)=>button(name,()=>update(shot=>{
          const p=shot.map, at=shot.in, end=Math.min(at+shot.duration,p.duration);
          const center={x:.5,y:.5,zoom:1.2,rotation:0};
          let first={...center,t:at},last={...center,t:end,ease:'smooth'};
          if(style==='follow'){
            const target=p.actors.find(actor=>actor.kind==='car');
            if(!target){message('该地图没有车辆');return;}
            first={...first,target:target.id,zoom:1.65};
            last={...last,target:target.id,zoom:1.65};
          }else if(style==='two'){
            const points=p.actors.filter(a=>a.points.length).slice(0,2).map(a=>a.points[0]);
            if(points.length<2){message('请选择含两个对象的地图');return;}
            first.x=last.x=(points[0].x+points[1].x)/2;
            first.y=last.y=(points[0].y+points[1].y)/2;
          }else if(style==='push'){first.zoom=1;last.zoom=2.6;}
          else if(style==='wide'){first.zoom=1.6;last.zoom=1;}
          p.camera=at===end?[first]:[first,last];
        }));
        items.append(button('用地图编辑器修改路径',()=>openMap(s)),
          preset('停车场俯视','top'),preset('跟随车辆','follow'),preset('两对象同框','two'),
          preset('事件推进','push'),preset('拉远结束','wide'));
        row.append(items);
      }
      const mediaList=Object.entries(project.assets).filter(([,a])=>['video','image'].includes(a.kind));
      if(mediaList.length)row.append(input('使用素材替换当前镜头','',v=>{
        if(!v)return;
        update(shot=>Object.assign(shot,{type:project.assets[v].kind==='video'?'FootageScene':'ImageScene',asset:v,in:0,x:0,y:0,zoom:1}));
      },'select',{list:[['','选择素材'],...mediaList.map(([id,a])=>[id,a.name])]}));
      const actions=el('div',undefined,'actions');
      actions.append(button('定位预览',()=>{selected=i;seek(s.start);}),button('上移',()=>{
        if(i===0)return;selected=i-1;edit(p=>[p.scenes[i-1],p.scenes[i]]=[p.scenes[i],p.scenes[i-1]]);
      }),button('下移',()=>{
        if(i>=shots.length-1)return;selected=i+1;edit(p=>[p.scenes[i],p.scenes[i+1]]=[p.scenes[i+1],p.scenes[i]]);
      }),button('移除镜头',()=>{
        if(shots.length<=1)return;selected=Math.max(0,i-1);edit(p=>p.scenes.splice(i,1));
      }));
      row.append(actions);return row;
    }));
  }
  function openMap(shot){
    editableShot=shot.id;
    editor=window.open('./?filmEdit=1','casemap-film-edit');
    if(!editor)message('浏览器阻挡了新标签页。可先下载项目 ZIP。');
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==editor||!project)return;
    const shot=project.scenes.find(s=>s.id===editableShot);
    if(!shot?.map)return;
    if(event.data?.type==='casemap-edit-ready')editor.postMessage({type:'casemap-edit-map',map:shot.map},location.origin);
    if(event.data?.type==='casemap-edit-result'){
      try {CaseMapProject.validate(event.data.map);edit(p=>p.scenes.find(s=>s.id===editableShot).map=event.data.map);message('地图片段已保存回分镜。');}
      catch(error){message(error.message);}
    }
  });
  const dataBrief=()=>({...Object.fromEntries(fields.map(id=>[id,$(id).value])),
    lat:$('latitude').valueAsNumber,lon:$('longitude').valueAsNumber});
  $('media').onchange=()=>{
    if(!$('rights').checked){message('请先确认您具有素材使用及导出权利。');$('media').value='';return;}
    for(const file of $('media').files){
      const kind=file.type.split('/')[0];
      if(!['video','image','audio'].includes(kind)||file.size>85_000_000){message('不支持该素材类型，或单文件超过 85 MB');continue;}
      const id=freshId(kind);
      uploadAssets[id]={kind,name:file.name.slice(0,150),credit:'用户提供 · 已在导入时确认使用权',rights:true,type:file.type};
      pendingFiles.set(id,file);
      if(project){
        files.set(id,file);
        try {edit(p=>{p.assets[id]=uploadAssets[id];if(kind==='audio'&&!p.voice)p.voice=id;});syncUrls();}
        catch(error){files.delete(id);message(error.message);}
      }
    }
    $('assets').textContent=Object.values(uploadAssets).map(s=>s.name).join(' · ');
  };
  async function clipLength() {
    const entry=[...pendingFiles].find(([id])=>uploadAssets[id]?.kind==='video');
    if(!entry)return 0;
    const url=URL.createObjectURL(entry[1]), video=document.createElement('video');video.preload='metadata';
    try{return await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('视频元数据读取超时')),8000);
      video.onloadedmetadata=()=>{clearTimeout(timeout);resolve(video.duration);};
      video.onerror=()=>{clearTimeout(timeout);reject(Error('视频暂无法在浏览器解码'));};
      video.src=url;
    });}finally{URL.revokeObjectURL(url);}
  }
  $('generate').onclick=async()=>{
    try {
      const brief=dataBrief(),length=await clipLength();
      const next=Film.plan(brief,{assets:{...uploadAssets},videoDuration:length,pace:brief.pace});
      const voice=Object.keys(next.assets).find(id=>next.assets[id].kind==='audio');
      if(voice)next.voice=voice;
      use(next,pendingFiles);
      message('已生成分镜。请核对未确认的事件时间、人物和录像对应关系。');
    }catch(error){message(error.message);}
  };
  $('load-demo').onclick=async()=>{
    try{
      const response=await fetch('examples/film-demo.json');
      if(!response.ok)throw Error('演示项目加载失败');
      use(await response.json());
    }catch(error){message(error.message);}
  };
  $('add-card').onclick=()=>{
    if(!project)return;selected=project.scenes.length;
    try{edit(p=>p.scenes.push(Film.titleScene(freshId('title'),'新文字镜头')));}catch(error){message(error.message);}
  };
  $('play').onclick=()=>{
    if(!project)return;
    if(playing){stop();return;}
    const total=Film.sequence(project.scenes).at(-1).end;
    if(time>=total-.1)time=0;
    const anchor=performance.now()-1000*time;
    playing=true;$('play').textContent='暂停';startVoice();
    const step=now=>{
      if(!playing)return;
      time=Math.min(total,(now-anchor)/1000);
      paint();
      if(time>=total)stop();else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  $('preview-selected').onclick=()=>{if(project)seek(Film.sequence(project.scenes)[selected]?.start||0);};
  $('seek').oninput=e=>seek(+e.target.value);
  $('resolution').onchange=e=>{if(project)edit(p=>p.width=+e.target.value);};
  $('fps').onchange=e=>{if(project)edit(p=>p.fps=+e.target.value);};
  $('reviewed').onchange=e=>{if(project){project.reviewed=e.target.checked;persist();refresh();}};
  function saveBlob(blob,name){
    const u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),20000);
  }
  function saveText(data,name,type='application/json'){
    if(!project){message('请先生成或导入影片。');return;}
    const content=typeof data==='function'?data(project):data;
    saveBlob(new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)],{type}),name);
  }
  $('save-board').onclick=()=>saveText(Film.storyboard,'storyboard.json');
  $('save-events').onclick=()=>saveText(p=>p.events,'events.json');
  $('draft-subs').onclick=()=>{
    if(!project)return;
    try{edit(p=>Film.draftCues(p));message('旁白字幕已按镜头时长分配，可逐镜头复核。');}
    catch(error){message(error.message);}
  };
  $('save-srt').onclick=()=>saveText(Film.srt,'subtitles.srt','text/plain');
  $('save-script').onclick=()=>saveText(Film.narration,'narration-zh.txt','text/plain');
  $('save-sources').onclick=()=>saveText(p=>({sources:p.sources,assets:p.assets}),'sources.json');
  $('save-project').onclick=async()=>{try{
    if(!project)throw Error('请先生成或导入影片');
    saveBlob(new Blob([await Pack.pack(project,files)],{type:'application/zip'}),'casemap-film.zip');
  }catch(error){message(error.message);}};
  $('import').onchange=async e=>{
    const file=e.target.files[0]; e.target.value='';if(!file)return;
    try{
      const magic=new Uint8Array(await file.slice(0,4).arrayBuffer());
      if(file.name.toLowerCase().endsWith('.zip')||(magic[0]===80&&magic[1]===75&&magic[2]===3&&magic[3]===4)){
        const payload=await file.arrayBuffer();
        if(payload.byteLength>110_000_000)throw Error('项目包不能超过 110 MB');
        const headers=fflate.unzipSync(new Uint8Array(payload),{filter:item=>
          item.originalSize<12_000_000&&['film.json','project.json'].includes(item.name)});
        if(Object.hasOwn(headers,'film.json')){
          const data=await Pack.unpack(payload);use(data.project,data.blobs);
        }else if(Object.hasOwn(headers,'project.json'))use(Film.migrate(await CaseMapPackage.unpack(payload)));
        else throw Error('ZIP 中找不到支持的影片或地图项目');
      }else{
        const value=JSON.parse(await file.text());use(value.version===1?Film.migrate(value):value);
      }
      message('影片项目已导入');
    }catch(error){message('导入失败 · '+error.message);}
  };
  async function api(path,options={}){
    if(!connection)throw Error('请先连接私有服务');
    const response=await fetch(connection.url+path,{...options,redirect:'error',cache:'no-store',
      headers:{Authorization:'Bearer '+connection.token,...options.headers}});
    if(!response.ok){const body=await response.json().catch(()=>null);throw Error(body?.error||'服务错误 '+response.status);}
    return response;
  }
  const jsonPost=(data)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  $('connect').onclick=async()=>{
    try{
      const u=new URL($('endpoint').value||location.origin);
      if(u.origin!==u.href.replace(/\/$/,'')||u.username||u.password||
        (u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname)))throw Error('仅可连接指定的 HTTPS 私有服务');
      const token=$('token').value.trim();
      if(token.length<32)throw Error('请输入私有服务访问口令');
      connection={url:u.origin,token};
      const caps=await (await api('/api/film/capabilities')).json();
      $('render').disabled=!caps.render;$('ai').disabled=!caps.ai;$('voice').disabled=!caps.voice;
      $('token').value='';
      message('私有制作服务已连接');
    }catch(error){connection=null;$('render').disabled=$('ai').disabled=$('voice').disabled=true;message(error.message);}
  };
  $('ai').onclick=async()=>{
    if(!window.confirm('将您输入的案情文字发送至所连接服务的 AI 供应商？'))return;
    try {
      const brief=dataBrief();
      const data=await (await api('/api/film/plan',jsonPost({brief,videoDuration:await clipLength(),assets:uploadAssets}))).json();
      use(data.project,pendingFiles);message('AI 草稿已生成，事件及路线仍需核实。');
    }catch(error){message(error.message);}
  };
  $('voice').onclick=async()=>{
    if(!project||!window.confirm('将当前旁白稿发送给所连接服务的语音供应商？'))return;
    try{
      const data=await (await api('/api/film/voice',jsonPost({project:{scenes:project.scenes.map(({duration,narration})=>({duration,narration}))},speed:$('voice-speed').valueAsNumber}))).blob();
      const id=freshId('voice');files.set(id,data);
      edit(p=>{p.assets[id]={kind:'audio',name:'中文合成旁白',credit:'已配置语音服务 · AI 合成',rights:true,type:'audio/mpeg'};p.voice=id;Film.draftCues(p);});
      syncUrls();message('旁白已生成并加入项目');
    }catch(error){message(error.message);}
  };
  async function progress(){
    if(!job||jobOrigin!==connection)return;
    try{
      const state=await (await api('/api/film/jobs/'+job)).json();
      message(state.stage+(state.frames?' · 已处理 '+state.frames+' 帧':'')+(state.error?' · '+state.error:''));
      if(state.stage==='已完成'){$('download-film').hidden=false;$('render').disabled=false;return;}
      if(state.stage==='失败'){$('render').disabled=false;return;}
      setTimeout(progress,1600);
    }catch(error){message(error.message);$('render').disabled=false;}
  }
  $('render').onclick=async()=>{
    if(!project?.reviewed){message('请先核对影片并勾选审核。');return;}
    if(!window.confirm('提交当前项目和素材到已连接的私有渲染服务？'))return;
    try{
      $('render').disabled=true;$('download-film').hidden=true;
      message('正在上传项目包');
      const body=new Blob([await Pack.pack(project,files)],{type:'application/zip'});
      const data=await (await api('/api/film/jobs',{method:'POST',body,headers:{'Content-Type':'application/zip'}})).json();
      job=data.id;jobOrigin=connection;void progress();
    }catch(error){message(error.message);$('render').disabled=false;}
  };
  $('download-film').onclick=async()=>{try{
    const response=await api('/api/film/jobs/'+job+'/video');saveBlob(await response.blob(),'case-documentary.mp4');
  }catch(error){message(error.message);}};
  void restore().then(row=>{if(row)use(row.project,new Map(row.files));}).catch(()=>{});
})();
