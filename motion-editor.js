(function (root) {
  'use strict';
  const Motion=root.CaseMapMotion;
  function mount(api) {
    const $=id=>document.getElementById(id);
    const {canvas,engine}=api;
    const fingers=new Map();
    let mode='select', auto=false, gesture=null, draft=[], owner='', picked=null;
    let activeTools, viewTime=null, raf=0;
    const say=text=>{$('motionStatus').textContent=text;};
    const active=()=>api.actor();
    const projection=(x,y)=>engine.screenToWorld(x,y,api.time());
    const screen=(p)=>engine.worldToScreen(p.x,p.y,api.time());
    const renderSoon=()=> {
      if(!raf) raf=requestAnimationFrame(()=>{raf=0;api.render();});
    };
    const routeMode=()=>['draw','nodes','edit'].includes(mode);
    function routeFields(a) {
      const points=Motion.sorted(a?.points||[]);
      const t=Math.max(api.time(),api.project().intro.duration);
      const start=a?.route&&points.length>1?points[0].t:t;
      $('routeStart').value=Number(start.toFixed(3));
      $('routeStart').max=api.project().duration;
      $('routeDuration').value=Number((a?.route&&points.length>1?points.at(-1).t-start:Math.max(.1,Math.min(8,api.project().duration-start))).toFixed(3));
      $('routeDuration').max=api.project().duration;
      for(const [id,key,initial] of [['routeSpeed','speed','linear'],['routeCurve','curve',.55],
        ['turnSlow','turnSlow',a?.kind==='car'?.6:0],['steering','steering',.4]]) $(id).value=a?.route?.[key]??initial;
    }
    function sync() {
      if (!api.project()) return;
      const a=active();
      if (owner !== (a?.id || '')) {
        owner=a?.id || '';
        picked=null; draft=[];
        routeFields(a);
      }
      if(picked && !a?.points.includes(picked))picked=null;
      $('motionObject').textContent=a?.name || '';
      $('routeSettings').hidden=!(a && routeMode());
      $('removeNode').disabled=!picked;
      $('autoKey').setAttribute('aria-pressed',String(auto));
      $('autoKey').textContent='自动关键帧：'+(auto?'开启':'关闭');
      $('editNodes').setAttribute('aria-pressed',String(mode==='edit'));
      $('saveView').hidden=mode!=='pan';
      $('resetView').hidden=!engine.previewCamera;
      for (const el of activeTools) el.setAttribute('aria-pressed',String(el.dataset.tool===mode));
      canvas.dataset.tool=mode;
    }
    function setMode(next) {
      mode=next;
      if (next==='draw' || next==='nodes') routeFields(active());
      sync();
      say({select:'点按或长按对象即可选择',move:auto?'拖动对象以记录当前位置':'打开自动关键帧后，松手记录位置',
        draw:'从对象位置沿道路滑动，松手后应用路线',nodes:'依次点击插入节点，再应用路线',
        edit:'点选、拖动或删除路线节点',key:'在当前时间点按画布记录位置',pan:'拖动画布构图，双指缩放，然后记录镜头'}[next]);
      api.render();
    }
    function viewForTime() {
      if (viewTime===api.time()) return;
      engine.previewCamera=null;
      viewTime=null;
    }
    function clearView() { engine.previewCamera=null; viewTime=null; }
    function coords(e) {
      const r=canvas.getBoundingClientRect();
      return { x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height,
        size:canvas.width/r.width };
    }
    function nearest(items,point,get,label) {
      let hit=null, gap=point.size*label;
      for (const item of items) {
        const [x,y]=screen(get(item));
        const distance=Math.hypot(x-point.x,y-point.y);
        if(distance<=gap) { hit=item;gap=distance; }
      }
      return hit;
    }
    function pickActor(p) {
      const candidates=api.project().actors.filter(a=>Motion.visible(a,api.time()));
      return nearest(candidates,p,a=>engine.actorPosition(a,api.time()),27);
    }
    function pointFor(p,snap=false) {
      const [x,y]=projection(p.x,p.y);
      if(!snap) return {x,y};
      const others=active().points.filter(item=>item!==gesture?.point);
      const hit=nearest(others,p,item=>item,10);
      return hit?{x:hit.x,y:hit.y}:{x,y};
    }
    function beginView(first,second) {
      const center=second?{x:(first.x+second.x)/2,y:(first.y+second.y)/2}:first;
      const view=engine.viewport(api.time());
      const anchor=projection(center.x,center.y);
      gesture={type:'view', view, anchor, pinch:!!second, span:second?Math.hypot(first.x-second.x,first.y-second.y):0};
    }
    function updateView(first,second) {
      const {view,anchor,span}=gesture;
      const center=second?{x:(first.x+second.x)/2,y:(first.y+second.y)/2}:first;
      const zoom=second?view.zoom*Math.hypot(first.x-second.x,first.y-second.y)/Math.max(span,1):view.zoom;
      engine.previewCamera={...view,zoom:Math.max(.5,Math.min(10,zoom))};
      const current=projection(center.x,center.y);
      engine.previewCamera.x=Math.max(0,Math.min(1,view.x+anchor[0]-current[0]));
      engine.previewCamera.y=Math.max(0,Math.min(1,view.y+anchor[1]-current[1]));
      viewTime=api.time();
      sync(); renderSoon();
    }
    function down(e) {
      if(!api.project() || api.full() || e.button>0) return;
      const pos=coords(e);
      api.stop();
      if(api.time()<api.project().intro.duration) api.seek(api.project().intro.duration);
      fingers.set(e.pointerId,pos);
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      if(fingers.size===2) {
        engine.actorPreview=null;
        beginView(...fingers.values());
        return;
      }
      if(fingers.size>1) return;
      if(mode==='pan') { beginView(pos); return; }
      if(mode==='select') {
        const current=pickActor(pos);
        if(current) api.select(current.id);
        else api.select('');
        sync();
        return;
      }
      let item=active();
      if(mode==='move') {
        const next=pickActor(pos);
        if(next && next!==item) { api.select(next.id); item=next; }
        if(!item || !nearest([item],pos,a=>engine.actorPosition(a,api.time()),30)) {
          say('请按住对象标记拖动'); return;
        }
        if(!auto) { say('自动关键帧已关闭，原路径保持原样'); return; }
        const origin=engine.actorPosition(item,api.time()), finger=pointFor(pos);
        gesture={type:'move',id:e.pointerId, start:pos,
          offset:{x:origin.x-finger.x,y:origin.y-finger.y}};
        return;
      }
      if(!item) { say('请先在项目与对象中添加或选择对象'); return; }
      if(mode==='draw') {
        const start=engine.actorPosition(item,api.time());
        gesture={type:'draw',id:e.pointerId,points:[start,pointFor(pos)]};
        renderSoon(); return;
      }
      if(mode==='edit') {
        picked=nearest(item.points,pos,p=>p,22);
        if(picked) {
          api.selectPoint(picked);
          gesture={type:'node',id:e.pointerId,point:picked,next:picked,start:pos};
          say('已选中 '+picked.t.toFixed(2)+' 秒节点');
        }
        sync(); renderSoon(); return;
      }
      gesture={type:mode,id:e.pointerId,start:pos};
    }
    function move(e) {
      if(!fingers.has(e.pointerId)) return;
      const pos=coords(e);
      fingers.set(e.pointerId,pos);
      if(!gesture) return;
      if(gesture.type==='view') {
        if(gesture.pinch && fingers.size!==2) return;
        updateView(...fingers.values());
        return;
      }
      if(gesture.id!==e.pointerId) return;
      if(gesture.type==='draw') {
        const point=pointFor(pos), points=gesture.points;
        if(points.length<1400 && Motion.distance(point,points.at(-1))>.0019) {
          points.push(point);
          renderSoon();
        }
        return;
      }
      if(gesture.type==='move' || gesture.type==='node') {
        if(Math.hypot(pos.x-gesture.start.x,pos.y-gesture.start.y)<pos.size*4 && !gesture.next) return;
        const base=pointFor(pos,gesture.type==='node');
        const offset=gesture.offset || {x:0,y:0};
        gesture.next={x:Math.max(0,Math.min(1,base.x+offset.x)),y:Math.max(0,Math.min(1,base.y+offset.y))};
        if(gesture.type==='move')engine.actorPreview={id:active().id,point:gesture.next};
        say(gesture.type==='move'?'松手记录 '+api.time().toFixed(2)+' 秒位置':'松手更新 '+gesture.point.t.toFixed(2)+' 秒节点');
        renderSoon();
      }
    }
    function end(e,cancel=false) {
      if(!fingers.has(e.pointerId)) return;
      fingers.delete(e.pointerId);
      const item=gesture;
      if(item?.type==='view') {
        if(!fingers.size) { gesture=null;say('已调整预览构图，点「记录镜头」保存'); }
        return;
      }
      if(item?.id!==e.pointerId) return;
      gesture=null;
      engine.actorPreview=null;
      if(cancel) {api.render();return;}
      const p=pointFor(coords(e));
      if(item.type==='move' && item.next) {
        picked=api.savePoint(item.next.x,item.next.y);
        say('已记录 '+api.time().toFixed(2)+' 秒位置');
      } else if(item.type==='node' && item.next && item.next!==item.point) {
        Object.assign(item.point,item.next); api.changed();
      } else if(item.type==='key') {
        picked=api.savePoint(p.x,p.y);
      } else if(item.type==='draw') {
        draft=Motion.compact([...item.points,p],.0032);
        say(draft.length>=2?'路线草稿已生成，设定时长后应用':'请画一段有长度的路线');
      } else if(item.type==='nodes') {
        if(!draft.length) draft=[engine.actorPosition(active(),api.time())];
        if(Motion.distance(draft.at(-1),p)>.001 && draft.length<100) draft.push(p);
        say('已添加 '+draft.length+' 个节点');
      }
      sync(); api.render();
    }
    function apply() {
      const a=active();
      if(!a) return;
      const start=Math.max(api.project().intro.duration,Number($('routeStart').value));
      const duration=Number($('routeDuration').value);
      if(!Number.isFinite(start) || !Number.isFinite(duration) || duration<.1 || start+duration>api.project().duration+.00001) {
        say('开始时间和时长须落在项目时间内');return;
      }
      const points=draft.length>=2?draft:Motion.sorted(a.points);
      if(points.length<2) {say('请先绘制或点选至少两个不同的路线位置');return;}
      const settings={speed:$('routeSpeed').value,curve:Number($('routeCurve').value),
        turnSlow:Number($('turnSlow').value),steering:Number($('steering').value)};
      a.route=settings;
      a.points=Motion.schedule(points.map(({x,y,note,heading,motion})=>({x,y,...(note?{note}:{}),
        ...(heading===undefined?{}:{heading}),...(motion?{motion}:{})})),start,duration,settings);
      draft=[];picked=null;
      $('routeStart').value=start;
      api.changed();
      api.seek(start);
      say('路线已保存 · '+a.points.length+' 个控制点，'+duration+' 秒');
    }
    function overlays() {
      viewForTime();
      const item=gesture;
      if(item?.type==='draw')return {draft:item.points,selectedPoint:picked};
      const node=item?.type==='node' && item.next;
      return {draft,selectedPoint:picked,guideOverride:node?{point:item.point,next:node}:null};
    }
    activeTools=document.querySelectorAll('#motionTools [data-tool]');
    activeTools.forEach(el=>{el.onclick=()=>setMode(el.dataset.tool);});
    $('autoKey').onclick=()=>{auto=!auto;setMode('move');};
    $('editNodes').onclick=()=>setMode('edit');
    $('removeNode').onclick=()=>{
      const a=active(), i=a?.points.indexOf(picked);
      if(i>=0) {a.points.splice(i,1);picked=null;api.changed();}
    };
    $('routeApply').onclick=apply;
    $('routeCancel').onclick=()=>{draft=[];say('已清空路线草稿');api.render();};
    $('saveView').onclick=()=>{
      const view=engine.previewCamera;
      if(!view){say('请先在画布上调整构图');return;}
      api.saveCamera(view);
      clearView();sync();api.render();say('镜头已记录在 '+api.time().toFixed(2)+' 秒');
    };
    $('resetView').onclick=()=>{clearView();sync();api.render();};
    canvas.addEventListener('pointerdown',down);
    canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',e=>end(e));
    canvas.addEventListener('pointercancel',e=>end(e,true));
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    return {sync,overlays,clearView,setMode,
      reset(){clearView(); owner=''; draft=[]; gesture=null; picked=null; fingers.clear();},
      highlight(point){picked=point;sync();}
    };
  }
  root.CaseMapMotionEditor={mount};
})(globalThis);
