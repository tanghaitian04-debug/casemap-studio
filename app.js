/* CaseMap Studio editor. The render page uses the same Canvas engine. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const format = window.CaseMapProject;
  const { Engine, clamp } = window.CaseMapEngine;
  const canvas = $('preview');
  const engine = new Engine(canvas);
  const easeLabels = { linear:'匀速', smooth:'缓入缓出', in:'加速', out:'减速', hold:'保持' };
  let project, selected = '', time = 0, playback = null, loop = true, drag = null, full = false, notice;
  let audioPlayers = [];
  const actor = () => project?.actors.find(item => item.id === selected);
  const frameTime = t => clamp(Math.round(t * project.fps) / project.fps, 0, project.duration);
  const readNumber = (input, min, max, fallback = min) =>
    input.value.trim() && Number.isFinite(Number(input.value)) ? clamp(Number(input.value), min, max) : fallback;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action, className) {
    const node = element('button', text, className);
    node.type = 'button';
    node.onclick = action;
    return node;
  }
  function options(input, pairs, current) {
    input.replaceChildren(...pairs.map(([value, title]) => new Option(title, value)));
    input.value = current;
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(notice);
    notice = setTimeout(() => $('toast').classList.remove('show'), 3400);
  }
  function panel(name) {
    document.body.dataset.panel = name;
    document.querySelectorAll('[data-panel]').forEach(node => {
      if (node.tagName === 'BUTTON') node.setAttribute('aria-current', String(node.dataset.panel === name));
    });
  }
  function persist() {
    try {
      format.save(localStorage, project);
      $('saveStatus').textContent = '本机已保存';
    } catch {
      $('saveStatus').textContent = '请导出 JSON';
    }
  }
  function revised() {
    persist();
    tracks();
    render();
  }
  function load(value) {
    format.validate(value);
    stop();
    project = value;
    time = 0;
    selected = '';
    engine.setProject(project);
    engine.ready().catch(error => toast(error.message));
    rebuildAudio();
    refresh();
    revised();
  }
  function timecode(t) {
    const index = Math.floor(t * project.fps + .0001);
    return [Math.floor(t/60),Math.floor(t%60),index%project.fps].map(n => String(n).padStart(2,'0')).join(':');
  }
  function render() {
    if (!project) return;
    engine.render(time, { editor: !full && !playback, selectedActor: selected });
    $('timecode').textContent = timecode(time) + ' / ' + timecode(project.duration);
    $('scrubber').value = String(time);
    $('playhead').style.left = 'calc(102px + (100% - 102px) * ' + time/project.duration + ')';
  }
  function seek(t, switchPanel = false) {
    stop();
    time = clamp(t,0,project.duration);
    if (switchPanel) panel('preview');
    cameraFields();
    render();
  }
  function stop() {
    if (playback) cancelAnimationFrame(playback.request);
    playback = null;
    for (const item of audioPlayers) item.audio.pause();
    $('btnPlay').textContent = '▶ 播放';
  }
  function rebuildAudio() {
    for (const item of audioPlayers) item.audio.pause();
    audioPlayers = (project.audio || []).map(clip => ({ clip, audio: new Audio(clip.source) }));
  }
  function syncAudio() {
    for (const {clip, audio} of audioPlayers) {
      const offset = time - clip.start;
      if (offset < 0 || Number.isFinite(audio.duration) && offset >= audio.duration) {
        audio.pause();
        continue;
      }
      audio.volume = Math.min(1, clip.gain ?? 1);
      if (audio.paused) {
        audio.currentTime = offset;
        audio.play().catch(() => {});
      } else if (Math.abs(audio.currentTime - offset) > .25) audio.currentTime = offset;
    }
  }
  function play() {
    if (playback) { stop(); render(); return; }
    if (time >= project.duration) time = 0;
    playback = { start: performance.now() - time * 1000, request: null };
    $('btnPlay').textContent = 'Ⅱ 暂停';
    const tick = now => {
      if (!playback) return;
      const elapsed = (now - playback.start) / 1000;
      if (elapsed >= project.duration && !loop) {
        seek(project.duration);
        return;
      }
      time = frameTime(elapsed % project.duration);
      if (audioPlayers.length) syncAudio();
      render();
      playback.request = requestAnimationFrame(tick);
    };
    syncAudio();
    playback.request = requestAnimationFrame(tick);
  }
  function refresh() {
    $('projectTitle').value = project.title;
    $('projectDuration').value = project.duration;
    $('introDuration').value = project.intro.duration;
    $('mapCredit').value = project.map.credit;
    $('place').value = project.intro.place || '';
    $('latitude').value = project.intro.latitude ?? 29;
    $('longitude').value = project.intro.end_longitude ?? -81;
    $('resolution').value = project.size[0];
    $('fps').value = project.fps;
    $('trackVisible').checked = project.show_tracks !== false;
    $('scrubber').max = project.duration;
    $('scrubber').step = 'any';
    actorList();
    inspector();
    cameraFields();
    tracks();
    itemLists();
  }
  function actorList() {
    $('actorCount').textContent = project.actors.length + ' 个对象';
    $('actorList').replaceChildren(...project.actors.map(item => {
      const choose = button('', () => select(item.id, true), 'actor-item' + (item.id === selected ? ' selected' : ''));
      const icon = element('span', item.kind === 'car' ? '▰' : item.kind === 'officer' ? '★' : '●', 'actor-icon');
      icon.style.backgroundColor = item.color || '#58c9ec';
      const info = element('span');
      info.append(element('b', item.name || item.id),
        element('small', (item.kind === 'car' ? '车辆' : '人物') + ' · ' + item.points.length + ' 个路径点'));
      choose.append(icon, info);
      return choose;
    }));
    options($('camTarget'), [['','自由镜头'], ...project.actors.map(a => [a.id,a.name])], $('camTarget').value || '');
  }
  function select(id, edit = false) {
    selected = id;
    actorList();
    inspector();
    if (edit) panel('edit');
    render();
  }
  function setEnd(input, value) {
    input.max = project.duration;
    input.value = value;
  }
  function inspector() {
    const item = actor();
    $('inspector').hidden = !item;
    $('inspectorEmpty').hidden = !!item;
    if (!item) return;
    $('actorName').value = item.name;
    $('actorKind').value = item.kind;
    $('actorColor').value = item.color?.length === 7 ? item.color : '#54c7e9';
    $('actorSize').value = item.size ?? 1;
    $('actorLayer').value = item.layer ?? 0;
    $('actorHeading').value = item.heading ?? '';
    $('actorVehicle').value = item.vehicle ?? 'sedan';
    $('actorMotion').value = item.motion ?? 'walk';
    $('vehicleField').hidden = item.kind !== 'car';
    $('motionField').hidden = item.kind === 'car';
    $('actorLabel').checked = item.label !== false;
    setEnd($('actorStart'), item.start ?? '');
    setEnd($('actorEnd'), item.end ?? '');
    $('pointCount').textContent = item.points.length + ' 个点';
    keyRows($('pointList'), item.points, false);
  }
  function keyRows(root, points, camera) {
    const sorted = [...points].sort((a,b) => a.t-b.t);
    root.replaceChildren(...sorted.map(point => {
      const row = element('div', undefined, 'point-row');
      const seconds = element('input', undefined, 'key-time');
      Object.assign(seconds,{type:'number',min:0,max:project.duration,step:.001,value:point.t});
      seconds.setAttribute('aria-label', camera ? '镜头关键帧秒数' : '路径关键帧秒数');
      seconds.onchange = () => {
        const next = readNumber(seconds,0,project.duration,point.t);
        if (points.some(item => item !== point && Math.abs(item.t-next) < .0005)) {
          seconds.value = point.t;
          toast('该时间已有关键帧');
          return;
        }
        point.t = next;
        reviseRows();
      };
      const label = camera ? point.zoom.toFixed(2)+'× / '+point.rotation+'°' :
        Math.round(point.x*100)+'%, '+Math.round(point.y*100)+'%';
      const remove = button('×',() => { points.splice(points.indexOf(point),1); reviseRows(); },'remove');
      remove.disabled = camera && points.length <= 1;
      remove.setAttribute('aria-label','删除关键帧');
      row.append(seconds, element('span',label),button('定位',() => seek(point.t)),remove);
      if (!camera) {
        const ease = element('select');
        ease.setAttribute('aria-label','路径缓动');
        options(ease,Object.entries(easeLabels),point.ease || 'smooth');
        ease.onchange = () => { point.ease = ease.value; revised(); };
        row.append(ease);
      }
      return row;
    }));
    function reviseRows() {
      if (camera) cameraFields();
      else { actorList(); inspector(); }
      revised();
    }
  }
  function cameraFields() {
    if (!project) return;
    const cam = engine.camera(time);
    const key = [...project.camera].sort((a,b) => a.t-b.t).filter(c=>c.t<=time+.001).at(-1);
    $('camZoom').value = clamp(cam.zoom,.5,10).toFixed(2);
    $('camRotation').value = cam.rotation.toFixed(1);
    $('camX').value = (cam.x*100).toFixed(1);
    $('camY').value = (cam.y*100).toFixed(1);
    $('camTilt').value = cam.tilt.toFixed(0);
    $('camTarget').value = key?.target ?? '';
    $('camEase').value = key?.ease ?? 'smooth';
    keyRows($('cameraList'),project.camera,true);
  }
  function tracks() {
    const duration = project.duration;
    const rows = [
      ['地球开场',project.intro.duration ? [{ t:0,end:project.intro.duration }] : []],
      ['摄像机',project.camera],
      ['地图背景',[{t:project.intro.duration,end:duration}]],
      ...project.actors.map(a => [a.name || a.id,a.points,a]),
      ['事件特效',project.events.map(e => ({t:e.t,end:e.t+(e.duration ?? 1.1)}))],
      ['字幕', project.captions.map(c => ({t:c.start,end:c.end}))],
      ['音效',(project.audio || []).map(c=>({t:c.start}))]
    ];
    $('ruler').replaceChildren(...Array.from({length:6},(_,i)=>element('span',(i*duration/5).toFixed(1)+' 秒')));
    $('tracks').replaceChildren(...rows.map(([name,points,trackActor]) => {
      const row=element('div',undefined,'track-row');
      const strip=element('div',undefined,'track-strip');
      strip.onclick = e => {
        if (e.target !== strip) return;
        const box = strip.getBoundingClientRect();
        if (trackActor) select(trackActor.id);
        seek(frameTime((e.clientX-box.left)/box.width*duration));
      };
      for (const p of points) {
        const marker=button('',() => { if (trackActor) select(trackActor.id); seek(p.t); },'track-marker');
        const label = name+' '+p.t.toFixed(2)+' 秒';
        marker.title = label;
        marker.setAttribute('aria-label',label);
        marker.style.setProperty('--start',Math.min(99,p.t/duration*100)+'%');
        marker.style.setProperty('--width',Math.max(0,Math.min(duration-p.t,(p.end??p.t)-p.t))/duration*100+'%');
        if (trackActor) marker.style.backgroundColor=trackActor.color || '#54c7e9';
        strip.append(marker);
      }
      row.append(element('strong',name),strip);
      return row;
    }));
  }
  function makeField(label, type, value, update, settings = {}) {
    const wrapper = element('label',label);
    const input = element(type==='select'?'select':'input');
    if (type==='select') options(input,settings.options,value);
    else {
      Object.assign(input, {type}, settings);
      if (type==='checkbox') input.checked=value;
      else input.value=value;
    }
    input.onchange = () => {
      const output = type==='checkbox' ? input.checked : type==='number' ?
        readNumber(input,Number(input.min),Number(input.max),Number(value)) : input.value;
      update(output);
      revised();
    };
    wrapper.append(input);
    return wrapper;
  }
  function itemLists() {
    const change = (list,item,key) => value => {
      item[key]=value;
      if (key==='start' && item.end!==undefined) item.end=Math.max(value,item.end);
      if (key==='end' && item.start!==undefined) item.start=Math.min(value,item.start);
      if (key==='type' || list===project.captions) itemLists();
    };
    const numeric = (label,item,key,value,min,max,step=.1,list) =>
      makeField(label,'number',item[key] ?? value,change(list,item,key),{min,max,step});
    function rows(id,list,label,fields) {
      $(id).replaceChildren(...list.map((item,i) => {
        const detail=element('details');
        detail.append(element('summary',label(item,i)),...fields(item),button('删除',() => {
          list.splice(list.indexOf(item),1);
          if (id==='audio') rebuildAudio();
          itemLists();
          revised();
        },'btn danger'));
        return detail;
      }));
    }
    rows('events',project.events,(e,i)=>format.effects[e.type]+' '+(i+1),e=>[
      makeField('类型','select',e.type,change(project.events,e,'type'),{options:Object.entries(format.effects)}),
      numeric('开始（秒）',e,'t',0,0,project.duration),
      numeric('持续（秒）',e,'duration',e.type==='gunfire'?.35:1.1,.03,180,.01),
      makeField('绑定对象','select',e.actor || '',change(project.events,e,'actor'),
        {options:[['','画面中心'],...project.actors.map(a=>[a.id,a.name])]}),
      makeField('颜色','color',e.color || '#ffdd62',change(project.events,e,'color')),
      numeric('大小',e,'size',1,.1,8),
      numeric('强度',e,'intensity',1,0,1),
      makeField('文字','text',e.text || '',change(project.events,e,'text'),{maxLength:120}),
      makeField('启用','checkbox',e.enabled!==false,change(project.events,e,'enabled'))
    ]);
    rows('captions',project.captions,(_,i)=>'字幕 '+(i+1),c=>[
      numeric('字幕开始（秒）',c,'start',0,0,project.duration,.1,project.captions),
      numeric('字幕结束（秒）',c,'end',0,0,project.duration,.1,project.captions),
      makeField('字幕内容','text',c.text,change(project.captions,c,'text'),{maxLength:200})
    ]);
    rows('audio',project.audio || [],c=>c.name,c=>[
      numeric('音效开始（秒）',c,'start',0,0,project.duration),
      numeric('音量',c,'gain',1,0,1,.05)
    ]);
  }
  function addActor(kind) {
    const t=Math.max(time,project.intro.duration);
    const item={id:crypto.randomUUID(),name:kind==='car'?'新车辆':'新人物',kind,
      color:kind==='car'?'#ee845e':'#58c9ec',points:[{t,x:.5,y:.5}]};
    project.actors.push(item);
    select(item.id,true);
    itemLists();
    revised();
  }
  function savePoint(x,y) {
    const item=actor();
    if (!item) return null;
    const t=Math.max(time,project.intro.duration);
    let point=item.points.find(p=>Math.abs(p.t-t)<.0005);
    if (!point) { point={t}; item.points.push(point); }
    Object.assign(point,{x,y});
    actorList();
    inspector();
    revised();
    return point;
  }
  function pointerPosition(event) {
    const rect=canvas.getBoundingClientRect();
    return [(event.clientX-rect.left)/rect.width*canvas.width,(event.clientY-rect.top)/rect.height*canvas.height];
  }
  canvas.onpointerdown = event => {
    if (full || !actor() || event.button!==0) return;
    seek(Math.max(project.intro.duration,time));
    const [x,y]=pointerPosition(event);
    const hit=actor().points.find(p=>{
      const [px,py]=engine.worldToScreen(p.x,p.y,time);
      return Math.hypot(px-x,py-y)<(event.pointerType==='touch'?40:19);
    });
    drag={point:hit || savePoint(...engine.screenToWorld(x,y,time)),id:event.pointerId,cameraTime:time};
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = event => {
    if (!drag || drag.id!==event.pointerId) return;
    const [x,y]=engine.screenToWorld(...pointerPosition(event),drag.cameraTime);
    Object.assign(drag.point,{x,y});
    render();
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    if (!drag) return;
    drag=null;
    inspector();
    revised();
  };
  const bound=(id,event,action)=>$(id).addEventListener(event, e=>{ if (project) action(e.target); });
  function setNumber(id, obj, key, min,max,fallback) {
    obj[key]=readNumber($(id),min,max,fallback);
    $(id).value=obj[key];
    revised();
  }
  bound('projectTitle','input',input=>{ project.title=input.value; persist(); render(); });
  bound('mapCredit','input',input=>{ project.map.credit=input.value; persist(); render(); });
  bound('place','input',input=>{ project.intro.place=input.value; persist(); render(); });
  bound('latitude','change',()=>setNumber('latitude',project.intro,'latitude',-90,90,29));
  bound('longitude','change',()=>setNumber('longitude',project.intro,'end_longitude',-180,180,-81));
  bound('introDuration','change',()=>setNumber('introDuration',project.intro,'duration',0,project.duration,0));
  bound('projectDuration','change',input=>{
    project.duration=readNumber(input,1,180,30);
    const limit = t => Math.min(t,project.duration);
    project.intro.duration=limit(project.intro.duration);
    for (const item of [...project.camera,...project.events,...project.actors.flatMap(a=>a.points)]) item.t=limit(item.t);
    for (const item of [...project.actors,...project.captions,...(project.audio||[])]) {
      if (item.start!==undefined) item.start=limit(item.start);
      if (item.end!==undefined) item.end=limit(item.end);
    }
    seek(limit(time));
    refresh();
    revised();
  });
  bound('resolution','change',input=>{ const w=Number(input.value); project.size=[w,w*9/16]; revised(); });
  bound('fps','change',input=>{ project.fps=Math.round(readNumber(input,1,60,30)); input.value=project.fps; revised(); });
  bound('trackVisible','change',input=>{ project.show_tracks=input.checked; revised(); });
  bound('actorName','input',input=>{ actor().name=input.value; actorList(); revised(); });
  bound('actorKind','change',input=>{ actor().kind=input.value; actorList(); inspector(); revised(); });
  bound('actorColor','input',input=>{ actor().color=input.value; revised(); });
  bound('actorSize','change',()=>setNumber('actorSize',actor(),'size',.25,4,1));
  bound('actorLayer','change',()=>setNumber('actorLayer',actor(),'layer',-100,100,0));
  for (const [id,key] of [['actorHeading','heading'],['actorStart','start'],['actorEnd','end']]) {
    bound(id,'change',input=>{
      if (input.value==='') delete actor()[key];
      else setNumber(id,actor(),key,Number(input.min),Number(input.max),0);
      revised();
    });
  }
  bound('actorLabel','change',input=>{ actor().label=input.checked; revised(); });
  bound('actorVehicle','change',input=>{ actor().vehicle=input.value; revised(); });
  bound('actorMotion','change',input=>{ actor().motion=input.value; revised(); });
  $('btnAddPerson').onclick=()=>addActor('person');
  $('btnAddCar').onclick=()=>addActor('car');
  $('btnRemoveActor').onclick=()=>{
    project.actors=project.actors.filter(a=>a.id!==selected);
    project.events=project.events.filter(e=>e.actor!==selected);
    for (const c of project.camera) if (c.target===selected) delete c.target;
    engine.setProject(project);
    select('');
    itemLists();
    revised();
  };
  $('btnAddPoint').onclick=()=>{
    const p=actor().points.length ? engine.actorPosition(actor(),time) : {x:.5,y:.5};
    savePoint(p.x,p.y);
  };
  $('btnCamera').onclick=()=>{
    const point={
      t:time,x:readNumber($('camX'),0,100,50)/100,y:readNumber($('camY'),0,100,50)/100,
      zoom:readNumber($('camZoom'),.5,10,1),rotation:readNumber($('camRotation'),-360,360,0),
      tilt:readNumber($('camTilt'),0,70,0),target:$('camTarget').value,ease:$('camEase').value
    };
    const prior=project.camera.find(p=>Math.abs(p.t-time)<.0005);
    if (prior) Object.assign(prior,point);
    else project.camera.push(point);
    cameraFields();
    revised();
  };
  $('btnEvent').onclick=()=>{
    const type=$('eventType').value;
    project.events.push({t:time,type,actor:selected,duration:type==='gunfire'?.35:1.1});
    itemLists();
    $('events').lastElementChild.open=true;
    revised();
  };
  $('btnCaption').onclick=()=>{
    project.captions.push({start:time,end:Math.min(time+3,project.duration),text:'新字幕'});
    itemLists();
    $('captions').lastElementChild.open=true;
    revised();
  };
  $('btnScript').onclick=()=>{
    try {
      const next=window.CaseMapScript.parse($('brief').value,format);
      next.map=project.map;
      load(next);
      panel('preview');
      toast('已生成可编辑的示意项目');
    } catch(error) { toast(error.message); }
  };
  function dataURL(file) {
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }
  async function importImage(file,w,h) {
    if (!file?.type.startsWith('image/') || file.size>20_000_000) throw new Error('请选择 20 MB 内的图片');
    const img = new Image();
    img.src=await dataURL(file);
    await img.decode();
    const ratio=Math.min(w/img.naturalWidth,h/img.naturalHeight,1);
    const surface=document.createElement('canvas');
    surface.width=Math.max(1,Math.round(img.naturalWidth*ratio));
    surface.height=Math.max(1,Math.round(img.naturalHeight*ratio));
    surface.getContext('2d').drawImage(img,0,0,surface.width,surface.height);
    return surface.toDataURL(file.type==='image/png' && w<=512?'image/png':'image/jpeg',.86);
  }
  function bindFile(btn,input,handler) {
    $(btn).onclick=()=>$(input).click();
    $(input).onchange=async event=>{
      const file=event.target.files[0];
      event.target.value='';
      if (!file) return;
      try { await handler(file); } catch(error) { toast(error.message); }
    };
  }
  bindFile('btnMap','mapFile',async file=>{
    const current=project;
    const image=await importImage(file,1920,1080);
    if (current!==project) return;
    project.map.image=image;
    project.map.credit='';
    $('mapCredit').value='';
    engine.setProject(project);
    revised();
    toast('地图已导入，请填写地图署名');
  });
  bindFile('btnAvatar','avatarFile',async file=>{
    const item=actor();
    const image=await importImage(file,512,512);
    if (!project.actors.includes(item)) return;
    item.avatar=image;
    engine.setProject(project);
    revised();
  });
  bindFile('btnAudio','audioFile',async file=>{
    if (file.size>7_000_000) throw new Error('音效文件须在 7 MB 内');
    const current=project;
    const source=await dataURL(file);
    if (project!==current) return;
    const clip={start:time,name:file.name.slice(0,160),source,gain:1};
    const audio=[...(project.audio||[]),clip];
    format.validate({...project,audio});
    project.audio=audio;
    rebuildAudio();
    itemLists();
    revised();
  });
  bindFile('btnImport','importFile',async file=>{
    if (file.size>45_000_000) throw new Error('项目文件超过 45 MB');
    load(JSON.parse(await file.text()));
    panel('preview');
    toast('项目已导入');
  });
  function download(blob,name) {
    const url=URL.createObjectURL(blob);
    const link=element('a');
    Object.assign(link,{href:url,download:name});
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function projectFile(outputName) {
    try {
      format.validate(project);
      const content={...project,...(outputName ? {outputName} : {})};
      download(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}),'casemap-project.json');
      toast('项目 JSON 已导出');
    } catch(error) { toast(error.message); }
  }
  $('btnExportJson').onclick=()=>projectFile();
  $('btnRecord').onclick=()=>$('exportDialog').showModal();
  $('btnRenderProject').onclick=()=>projectFile($('outputName').value.trim());
  $('btnFrame').onclick=()=>{engine.render(time);canvas.toBlob(blob=>{if(blob)download(blob,'casemap-frame.png');});render();};
  $('btnReset').onclick=()=>{ load(format.empty()); panel('assets'); toast('已创建新项目'); };
  async function demo() {
    const response=await fetch('examples/demo.json');
    if (!response.ok) throw new Error('无法读取示例项目');
    return response.json();
  }
  $('btnDemo').onclick=async()=>{try{load(await demo());panel('preview');}catch(error){toast(error.message);}};
  $('scrubber').oninput=e=>seek(frameTime(Number(e.target.value)));
  $('timelineZoom').oninput=e=>{$('trackSurface').style.width=(Number(e.target.value)*100)+'%';render();};
  $('btnPlay').onclick=play;
  $('btnBack').onclick=()=>seek(frameTime(time-1/project.fps));
  $('btnForward').onclick=()=>seek(frameTime(time+1/project.fps));
  $('btnLoop').onclick=()=>{
    loop=!loop;
    $('btnLoop').classList.toggle('active',loop);
    $('btnLoop').setAttribute('aria-pressed',String(loop));
  };
  $('btnPreview').onclick=()=>{
    full=!full;
    document.body.classList.toggle('full-preview',full);
    $('btnPreview').textContent=full?'退出全屏':'全屏预览';
    render();
  };
  document.querySelectorAll('.mobile-tabs button').forEach(node=>{node.onclick=()=>panel(node.dataset.panel);});
  engine.onReady=render;
  options($('eventType'),Object.entries(format.effects),'alert');
  options($('camEase'),Object.entries(easeLabels),'smooth');
  panel('preview');
  (async()=>{
    const stored=format.restore(localStorage);
    try { load(stored || await demo()); }
    catch(error) { load(format.empty());toast(error.message); }
  })();
})();
