/* CaseMap Studio editor. The render page uses the same Canvas engine. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const format = window.CaseMapProject;
  const { Engine, clamp } = window.CaseMapEngine;
  const canvas = $('preview');
  const engine = new Engine(canvas);
  const easeLabels = { linear:'匀速', smooth:'缓入缓出', in:'加速', out:'减速', hold:'保持' };
  let project, selected = '', time = 0, playback = null, loop = true, full = false, notice;
  let audioPlayers = [];
  const Motion = window.CaseMapMotion;
  const Geo = window.CaseMapGeo;
  const past=[], future=[];
  let lastState=null, selectedPoint=null, keyClipboard=[], multi=false;
  const chosenKeys=new Set();
  const motion=window.CaseMapMotionEditor.mount({
    canvas,engine,project:()=>project,actor:()=>actor(),time:()=>time,full:()=>full,render,seek,stop,select,
    savePoint,saveCamera,selectPoint,saveLocation,
    changed(){actorList();inspector();revised();}
  });

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
  let saveSequence=0, savedSequence=0, pendingDraft=null, writing=false;
  const draftKey='casemap-draft-v1-clock';
  async function flushDraft() {
    if(writing)return;
    writing=true;
    while(pendingDraft) {
      const draft=pendingDraft;
      pendingDraft=null;
      try {
        await window.CaseMapDrafts.write({project:draft.project,clock:draft.clock});
        savedSequence=Math.max(savedSequence,draft.sequence);
        if(draft.sequence===saveSequence)$('saveStatus').textContent='本机已保存';
      } catch {
        if(draft.sequence===saveSequence && savedSequence<draft.sequence){
          $('saveStatus').textContent='草稿未保存，请下载项目';
          toast('草稿无法存到浏览器，请下载项目 ZIP');
        }
      }
    }
    writing=false;
  }
  function persist(snapshot=structuredClone(project)) {
    const sequence=++saveSequence, clock=Date.now();
    const media=[project.map.image,...project.actors.map(a=>a.avatar||''),...(project.audio||[]).map(a=>a.source)];
    if(media.reduce((n,x)=>n+x.length,0)<2_000_000) {
      try {
        format.save(localStorage,project);
        localStorage.setItem(draftKey,String(clock));
        savedSequence=sequence;
      } catch {}
    }
    $('saveStatus').textContent=savedSequence===sequence?'本机已保存':'正在保存草稿…';
    pendingDraft={project:snapshot,clock,sequence};
    void flushDraft();
  }
  window.addEventListener('beforeunload',event=>{
    if(saveSequence>savedSequence){event.preventDefault();event.returnValue='';}
  });
  async function recoverDraft() {
    let local=null,clock=0;
    try {local=format.restore(localStorage);clock=Number(localStorage.getItem(draftKey)||0);} catch {}
    let remote=null;
    try { remote=await window.CaseMapDrafts.read(); } catch {}
    if(remote && (!local || remote.clock>=clock)) {
      try { return format.validate(remote.project); } catch {}
    }
    return local;
  }
  function historyButtons() {
    $('undo').disabled=!past.length;
    $('redo').disabled=!future.length;
  }
  function revised() {
    if(lastState) {
      past.push(lastState);
      if(past.length>45) past.shift();
    }
    lastState=structuredClone(project);
    future.length=0;
    historyButtons();
    persist(lastState);
    tracks();
    motion.sync();
    render();
  }
  function applyState(value,reset=false) {
    stop();
    project=structuredClone(value);
    if(reset) { time=0; selected=''; }
    else {
      time=Math.min(time,project.duration);
      if(!actor())selected='';
    }
    motion.reset();
    selectedPoint=null;
    chosenKeys.clear();
    engine.setProject(project);
    engine.ready().catch(error=>toast(error.message));
    rebuildAudio();
    refresh();
    motion.sync();
    persist(value);
    render();
  }
  function load(value) {
    format.validate(value);
    applyState(value,true);
    past.length=0; future.length=0;
    lastState=structuredClone(project);
    historyButtons();
  }
  function history(from,to) {
    if (!from.length) return;
    to.push(lastState);
    lastState=from.pop();
    applyState(lastState);
    historyButtons();
  }
  $('undo').onclick=()=>history(past,future);
  $('redo').onclick=()=>history(future,past);
  document.addEventListener('keydown',event=>{
    if(!event.metaKey && !event.ctrlKey) return;
    if(event.key.toLowerCase()!=='z' || event.target.matches('input,textarea,[contenteditable]')) return;
    event.preventDefault();
    if(event.shiftKey) history(future,past);
    else history(past,future);
  });
  function timecode(t) {
    const index = Math.floor(t * project.fps + .0001);
    return [Math.floor(t/60),Math.floor(t%60),index%project.fps].map(n => String(n).padStart(2,'0')).join(':');
  }
  function render() {
    if (!project) return;
    const overlays=motion.overlays();
    engine.render(time,{editor:!full&&!playback,quality:playback?'preview':'still',selectedActor:selected,...overlays});
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
    motion.clearView();
    motion.sync();
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
    $('introPace').value=project.intro.pace || 'smooth';
    $('geoState').value=project.intro.state || '';
    $('geoCity').value=project.intro.city || '';
    $('geoProjection').value=project.map.bounds?.projection || 'mercator';
    for(const k of ['West','East','South','North']) $('geo'+k).value=project.map.bounds?.[k.toLowerCase()]??'';
    $('removeBounds').disabled=!project.map.bounds;
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
    if(selected!==id) { selectedPoint=null; chosenKeys.clear(); }
    selected = id;
    actorList();
    inspector();
    if (edit) panel('edit');
    motion.sync();
    tracks();
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
      if(!points.includes(selectedPoint)){chosenKeys.delete(selectedPoint);selectedPoint=null;}
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
  function selectPoint(point) {
    selectedPoint=point || null;
    if(point) {
      $('keyNote').value=point.note || '';
      $('keyMotion').value=point.motion || '';
      $('keyHeading').value=point.heading ?? '';
    }
  }
  $('noteKey').onclick=()=>{
    if(!selectedPoint){toast('请先选中一个关键帧');return;}
    const field=$('keyNoteField');
    field.hidden=!field.hidden;
    $('noteKey').setAttribute('aria-expanded',String(!field.hidden));
  };
  $('keyNote').onchange=e=>{
    if(!selectedPoint)return;
    selectedPoint.note=e.target.value;
    revised();
  };
  $('keyMotion').onchange=e=>{
    if(!actor()?.points.includes(selectedPoint))return;
    if(e.target.value) selectedPoint.motion=e.target.value;
    else delete selectedPoint.motion;
    revised();
  };
  $('keyHeading').onchange=e=>{
    if(!actor()?.points.includes(selectedPoint))return;
    if(e.target.value) selectedPoint.heading=readNumber(e.target,-360,360,0);
    else delete selectedPoint.heading;
    revised();
  };
  $('multiKeys').onclick=()=>{
    multi=!multi;
    chosenKeys.clear();
    $('multiKeys').setAttribute('aria-pressed',String(multi));
    tracks();
  };
  let clipboardTrack='';
  function trackKeys() {
    if(actor()?.points.includes(selectedPoint))return actor().points;
    if(project.camera.includes(selectedPoint))return project.camera;
    return null;
  }
  $('copyKeys').onclick=()=>{
    const source=trackKeys();
    if(!source){toast('请先选中人物、车辆或镜头的关键帧');return;}
    const group=source.filter(p=>chosenKeys.has(p));
    keyClipboard=Motion.sorted(group.length?group:[selectedPoint]).map(p=>({...p}));
    clipboardTrack=source===project.camera?'camera':'actor';
    toast('已复制 '+keyClipboard.length+' 个关键帧');
  };
  $('pasteKeys').onclick=()=>{
    if(!keyClipboard.length){toast('请先复制关键帧');return;}
    const source=clipboardTrack==='camera'?project.camera:actor()?.points;
    if(!source){toast('请选择目标对象');return;}
    const first=keyClipboard[0].t;
    const last=keyClipboard.at(-1).t;
    if(time+(last-first)>project.duration){toast('粘贴时间超出项目长度');return;}
    if(source.length+keyClipboard.length>500){toast('关键帧数量已达上限');return;}
    chosenKeys.clear();
    for(const {t,...values} of keyClipboard) chosenKeys.add(Motion.put(source,time+(t-first),values));
    selectPoint([...chosenKeys][0]);
    motion.highlight(clipboardTrack==='actor'?selectedPoint:null);
    inspector();cameraFields();revised();
  };
  function snap(t) {
    return $('timeSnap').value==='second'?clamp(Math.round(t),0,project.duration):frameTime(t);
  }
  function enableMarkerDrag(marker,strip,item,groupData,activate) {
    let drag=null, ignoreClick=false;
    marker.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      drag={id:e.pointerId,x:e.clientX,width:strip.getBoundingClientRect().width,delta:0,moved:false};
      try { marker.setPointerCapture(e.pointerId); } catch {}
    });
    marker.addEventListener('pointermove',e=>{
      if(drag?.id!==e.pointerId)return;
      const offset=e.clientX-drag.x;
      if(!drag.moved && Math.abs(offset)<4)return;
      drag.moved=true;
      drag.delta=snap(item.t+offset/drag.width*project.duration)-item.t;
      const target=clamp(item.t+drag.delta,0,project.duration);
      marker.style.setProperty('--start',Math.min(99,target/project.duration*100)+'%');
      marker.title=target.toFixed(2)+' 秒';
    });
    marker.addEventListener('click',e=>{
      if(ignoreClick){ignoreClick=false;return;}
      activate(e);
    });
    const finish=(e,cancel=false)=>{
      if(drag?.id!==e.pointerId)return;
      const {moved,delta}=drag;
      drag=null;
      if(!moved)return;
      ignoreClick=true;
      if(cancel){tracks();return;}
      const data=groupData(delta);
      if(!data){tracks();toast('该位置与其他关键帧冲突或超出时间轴');return;}
      if(data.actor) select(data.actor.id);
      selectPoint(data.key);
      motion.highlight(data.actor?data.key:null);
      seek(data.time);
      inspector();
      revised();
    };
    marker.addEventListener('pointerup',finish);
    marker.addEventListener('pointercancel',e=>finish(e,true));
  }
  function tracks() {
    const duration=project.duration;
    const rows=[
      ['地球开场',project.intro.duration?[{t:0,end:project.intro.duration}]:[]],
      ['摄像机',project.camera,null,'key'],
      ['地图背景',[{t:project.intro.duration,end:duration}]],
      ...project.actors.map(a=>[a.name||a.id,a.points,a,'key']),
      ['事件特效',project.events.map(e=>({t:e.t,end:e.t+(e.duration??1.1),ref:e})),null,'event'],
      ['字幕',project.captions.map(c=>({t:c.start,end:c.end,ref:c})),null,'caption'],
      ['音效',(project.audio||[]).map(c=>({t:c.start,ref:c})),null,'audio']
    ];
    $('ruler').replaceChildren(...Array.from({length:6},(_,i)=>element('span',(i*duration/5).toFixed(1)+' 秒')));
    $('tracks').replaceChildren(...rows.map(([name,points,trackActor,kind])=>{
      const row=element('div',undefined,'track-row'+(trackActor?.id===selected?' selected':''));
      const strip=element('div',undefined,'track-strip');
      strip.onclick=e=>{
        if(e.target!==strip)return;
        const rect=strip.getBoundingClientRect();
        if(trackActor)select(trackActor.id);
        seek(snap((e.clientX-rect.left)/rect.width*duration));
      };
      for(const p of points) {
        const marker=element('button',undefined,'track-marker'+(chosenKeys.has(p)||selectedPoint===p?' picked':''));
        marker.type='button';
        const label=name+' '+p.t.toFixed(2)+' 秒';
        marker.title=p.note?label+' · '+p.note:label;
        marker.setAttribute('aria-label',label);
        marker.style.setProperty('--start',Math.min(99,p.t/duration*100)+'%');
        marker.style.setProperty('--width',Math.max(0,Math.min(duration-p.t,(p.end??p.t)-p.t))/duration*100+'%');
        if(trackActor)marker.style.backgroundColor=trackActor.color||'#54c7e9';
        const activate=()=>{
          if(trackActor && trackActor.id!==selected) select(trackActor.id);
          if(kind==='key') {
            if(multi && chosenKeys.has(p))chosenKeys.delete(p);
            else {
              if(!multi)chosenKeys.clear();
              chosenKeys.add(p);
            }
            selectPoint(p);
            motion.highlight(trackActor?p:null);
          }
          seek(p.t);
          tracks();
        };
        if(!kind)marker.onclick=activate;
        else enableMarkerDrag(marker,strip,p,delta=>{
          if(kind==='key') {
            const group=chosenKeys.has(p)?points.filter(item=>chosenKeys.has(item)):[p];
            if(group.some(item=>item.t+delta<-.000001 || item.t+delta>duration+.000001 ||
              points.some(other=>!group.includes(other)&&Math.abs(item.t+delta-other.t)<.0005)))return null;
            for(const item of group)item.t=clamp(item.t+delta,0,duration);
            return {time:p.t,key:p,actor:trackActor};
          }
          const end=p.end??p.t;
          const start=clamp(p.t+delta,0,Math.max(0,duration-(end-p.t)));
          if(kind==='event')p.ref.t=start;
          else p.ref.start=start;
          if(kind==='caption')p.ref.end=start+(end-p.t);
          itemLists();
          return {time:start};
        },activate);
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
  function addActor(kind,vehicle) {
    const t=Math.max(time,project.intro.duration);
    const item={id:crypto.randomUUID(),name:vehicle==='police'?'警车':kind==='car'?'新车辆':'新人物',kind,
      ...(vehicle?{vehicle}:{}),
      color:kind==='car'?'#ee845e':'#58c9ec',points:[{t,x:.5,y:.5}]};
    project.actors.push(item);
    select(item.id);
    panel('preview');
    itemLists();
    revised();
  }
  function savePoint(x,y) {
    const item=actor();
    if(!item)return null;
    const t=Math.max(time,project.intro.duration);
    const point=Motion.put(item.points,t,{x,y});
    if(!point){toast('关键帧已达上限');return null;}
    selectPoint(point);
    motion.highlight(point);
    actorList();
    inspector();
    revised();
    return point;
  }
  const bound=(id,event,action)=>$(id).addEventListener(event, e=>{ if (project) action(e.target); });
  function setNumber(id, obj, key, min,max,fallback) {
    obj[key]=readNumber($(id),min,max,fallback);
    $(id).value=obj[key];
    revised();
  }
  function saveLocation(lat,lon,place) {
    project.intro.latitude=lat;
    project.intro.end_longitude=lon;
    if(place) project.intro.place=place;
    $('latitude').value=lat;
    $('longitude').value=lon;
    $('place').value=project.intro.place||'';
    revised();
  }
  const states=[...new Set(Geo.cities.map(c=>c[0]))];
  $('geoStates').replaceChildren(...states.map(value=>new Option(value)));
  $('geoCities').replaceChildren(...Geo.cities.map(c=>new Option(c[1])));
  $('locateCity').onclick=()=>{
    const city=Geo.findCity($('geoState').value,$('geoCity').value);
    if(!city){toast('该城市不在离线索引中，可直接填写经纬度');return;}
    const [state,name,lat,lon]=city;
    project.intro.state=state;project.intro.city=name;
    $('geoState').value=state;$('geoCity').value=name;
    saveLocation(lat,lon,name+' · '+state);
    toast('已定位城市中心，现场可在配准底图上取点');
  };
  $('applyBounds').onclick=()=>{
    if(!project.map.credit.trim() || ['assets/demo-map.jpg','assets/demo-map.webp'].includes(project.map.image)){
      toast('请先上传有授权的底图并填写署名');return;
    }
    const bounds={projection:$('geoProjection').value};
    for(const key of ['West','East','South','North'])bounds[key.toLowerCase()]=$('geo'+key).valueAsNumber;
    if(!Geo.valid(bounds)){toast('无法保存该配准。请检查四边范围及投影。');return;}
    project.map.bounds=bounds;
    $('removeBounds').disabled=false;
    revised();
    toast('已保存配准，预览区可直接地图取点');
  };
  $('removeBounds').onclick=()=>{
    delete project.map.bounds;
    $('removeBounds').disabled=true;
    revised();
  };
  bound('geoState','change',input=>{project.intro.state=input.value;revised();});
  bound('geoCity','change',input=>{project.intro.city=input.value;revised();});
  bound('introPace','change',input=>{project.intro.pace=input.value;revised();});
  bound('projectTitle','input',input=>{ project.title=input.value; revised(); });
  bound('mapCredit','input',input=>{ project.map.credit=input.value; if(!input.value.trim()) delete project.map.bounds; revised(); });
  bound('place','input',input=>{ project.intro.place=input.value; revised(); });
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
  $('btnAddPolice').onclick=()=>addActor('car','police');
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
  function saveCamera(view) {
    const point={
      x:clamp(view.x,0,1),y:clamp(view.y,0,1),zoom:clamp(view.zoom,.5,10),
      rotation:clamp(view.rotation,-360,360),tilt:clamp(view.tilt||0,0,70),
      target:view.target||'',ease:view.ease||'smooth'
    };
    if(!Motion.put(project.camera,time,point)){toast('镜头关键帧已达上限');return;}
    cameraFields();
    revised();
  }
  $('btnCamera').onclick=()=>saveCamera({
    x:readNumber($('camX'),0,100,50)/100,y:readNumber($('camY'),0,100,50)/100,
    zoom:readNumber($('camZoom'),.5,10,1),rotation:readNumber($('camRotation'),-360,360,0),
    tilt:readNumber($('camTilt'),0,70,0),target:$('camTarget').value,ease:$('camEase').value
  });
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
    delete project.map.bounds;
    $('removeBounds').disabled=true;
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
    if (file.size>50_000_000) throw new Error('项目文件超过 50 MB');
    const value=file.name.toLowerCase().endsWith('.zip')?
      await window.CaseMapPackage.unpack(await file.arrayBuffer()):JSON.parse(await file.text());
    load(value);
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
  function projectFile(outputName,options={}) {
    try {
      format.validate(project);
      const content={...project,...options,...(outputName ? {outputName} : {})};
      download(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}),'casemap-project.json');
      toast('项目 JSON 已导出');
    } catch(error) { toast(error.message); }
  }
  $('btnExportJson').onclick=()=>projectFile();
  $('btnProjectZip').onclick=async()=>{
    try {
      await engine.ready();
      const packageBytes=await window.CaseMapPackage.pack(project);
      download(new Blob([packageBytes],{type:'application/zip'}),'casemap-project.zip');
      toast('项目包已导出');
    } catch(error) { toast(error.message); }
  };
  const cloud=window.CaseMapCloud.mount({
    project:()=>project,ready:()=>engine.ready(),download,toast,
    useProject(value){load(value);panel('preview');}
  });
  $('btnRecord').onclick=()=>cloud.open();
  $('btnRenderProject').onclick=()=>projectFile($('outputName').value.trim(),cloud.options());
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
  motion.setMode('select');
  (async()=>{
    const stored=await recoverDraft();
    try { load(stored || await demo()); }
    catch(error) { load(format.empty());toast(error.message); }
  })();
})();
