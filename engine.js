/* CaseMap Studio rendering engine — standalone Canvas2D, no network or paid API. */
(function(global){
'use strict';
const Motion=typeof module==='object'?require('./motion.js'):global.CaseMapMotion;
const Geo=typeof module==='object'?require('./geo.js'):global.CaseMapGeo;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,u)=>a+(b-a)*u;
const smooth=(u)=>u*u*(3-2*u);
const easing = { linear: u => u, smooth, in: u => u*u, out: u => 1-(1-u)**2, hold: u => Number(u >= 1) };
const active = (event, t) => event.enabled !== false && t >= event.t && t < event.t + (event.duration ?? (event.type === 'gunfire' ? .35 : 1.1));
function interp(points,t,keys,curve='linear'){
  if(!points||!points.length)return Object.fromEntries(keys.map(k=>[k,0]));
  const sorted=[...points].sort((a,b)=>a.t-b.t);
  if(t<=sorted[0].t)return Object.fromEntries(keys.map(k=>[k,Number(sorted[0][k]??0)]));
  for(let i=0;i<sorted.length-1;i++){
    const a=sorted[i],b=sorted[i+1];
    if(t<=b.t){const u=(easing[b.ease] || easing[curve])(clamp((t-a.t)/Math.max(.00001,b.t-a.t),0,1));return Object.fromEntries(keys.map(k=>[k,lerp(Number(a[k]??0),Number(b[k]??0),u)]));}
  }
  const last=sorted[sorted.length-1];return Object.fromEntries(keys.map(k=>[k,Number(last[k]??0)]));
}
function drawRounded(ctx,x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function hexToRgba(hex,alpha=1){let s=String(hex||'#f04c60').replace('#','');if(s.length===3)s=[...s].map(x=>x+x).join('');return `rgba(${parseInt(s.slice(0,2),16)||0},${parseInt(s.slice(2,4),16)||0},${parseInt(s.slice(4,6),16)||0},${alpha})`;}
function starSeed(i){let n=Math.sin(i*93.174+31.5)*43758.5453;return n-Math.floor(n);}
class Engine {
  constructor(canvas, platform = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.project = null;
    this.mapRef = '';
    this.avatars = {};
    this.onReady = () => {};
    this.loadImage = platform.loadImage || (ref => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('无法读取场景图片'));
      image.src = ref;
    }));
    const create = platform.createCanvas || (() => document.createElement('canvas'));
    this.globeCanvas = create();
    this.globeCtx = this.globeCanvas.getContext('2d');
    this.earthReady = this.loadImage('assets/earth.webp').then(earth => {
      const surface = create();
      [surface.width, surface.height] = [earth.width, earth.height];
      const context = surface.getContext('2d', { willReadFrequently: true });
      context.drawImage(earth, 0, 0);
      this.earthData = context.getImageData(0, 0, surface.width, surface.height);
      this.onReady();
    });
    this.earthReady.catch(() => {});
  }
  setProject(project) {
    this.project = project;
    const load = (ref, onload) => {
      const asset = { ref, image: null };
      asset.ready = this.loadImage(ref).then(image => {
        asset.image = image;
        onload(image);
        this.onReady();
      });
      asset.ready.catch(() => {});
      return asset;
    };
    const ref = project.map.image === 'assets/demo-map.jpg' ? 'assets/demo-map.webp' : project.map.image;
    if (this.mapRef !== ref) {
      this.mapRef = ref;
      this.map = null;
      this.mapAsset = load(ref, img => { if (this.mapRef === ref) this.map = img; });
    }
    const assets = Object.create(null);
    for (const actor of project.actors) {
      if (actor.avatar) assets[actor.id] = this.avatars[actor.id]?.ref === actor.avatar
        ? this.avatars[actor.id] : load(actor.avatar, () => {});
    }
    this.avatars = assets;
  }
  async ready() {
    await Promise.all([this.earthReady, this.mapAsset.ready, ...Object.values(this.avatars).map(a => a.ready)]);
  }
  camera(t) {
    const project = this.project;
    const c = interp(project.camera, t, ['x', 'y', 'zoom', 'rotation', 'tilt'], 'smooth');
    const frame = [...project.camera].sort((a,b) => a.t-b.t).filter(item => item.t <= t).at(-1);
    const target = project.actors.find(actor => actor.id === frame?.target && actor.points.length);
    if (target) Object.assign(c, this.actorPosition(target, t));
    for (const e of project.events) {
      if (!active(e, t)) continue;
      const age = t - e.t;
      const fade = 1 - age / (e.duration ?? 1.1), strength = (e.intensity ?? 1) * (e.size ?? 1);
      if (e.type === 'push') c.zoom *= 1 + .24 * fade * strength;
      if (e.type === 'shake') {
        c.x += Math.sin(age * 92) * .006 * fade * strength;
        c.y += Math.sin(age * 71) * .008 * fade * strength;
      }
    }
    return c;
  }
  viewport(t) {
    if(this.frameView?.time===t)return this.frameView.camera;
    const c=this.previewCamera ? {...this.previewCamera} : this.camera(t);
    if (this.previewCamera || !this.project.map.keepInFrame) return c;
    const {width:w,height:h}=this.canvas, angle=c.rotation*Math.PI/180;
    const cos=Math.abs(Math.cos(angle)), sin=Math.abs(Math.sin(angle));
    const tilt=Math.cos(c.tilt*Math.PI/180);
    const width=cos + (h/w)*sin/tilt, height=(w/h)*sin + cos/tilt;
    c.zoom=Math.max(c.zoom,width,height);
    c.x=clamp(c.x,width/(2*c.zoom),1-width/(2*c.zoom));
    c.y=clamp(c.y,height/(2*c.zoom),1-height/(2*c.zoom));
    return c;
  }
  worldToScreen(x, y, t) {
    const c=this.viewport(t), w=this.canvas.width, h=this.canvas.height;
    const r=c.rotation*Math.PI/180, dx=(x-c.x)*w, dy=(y-c.y)*h;
    return [w/2+c.zoom*(dx*Math.cos(r)-dy*Math.sin(r)),
      h/2+c.zoom*Math.cos(c.tilt*Math.PI/180)*(dx*Math.sin(r)+dy*Math.cos(r))];
  }
  screenToWorld(px, py, t) {
    const c=this.viewport(t), w=this.canvas.width, h=this.canvas.height;
    const r=-c.rotation*Math.PI/180, dx=(px-w/2)/c.zoom, dy=(py-h/2)/c.zoom/Math.cos(c.tilt*Math.PI/180);
    return [clamp(c.x+(dx*Math.cos(r)-dy*Math.sin(r))/w,0,1),
      clamp(c.y+(dx*Math.sin(r)+dy*Math.cos(r))/h,0,1)];
  }
  drawStars() {
    const {ctx,canvas}=this,w=canvas.width,h=canvas.height;
    const backdrop=ctx.createRadialGradient(w*.46,h*.42,0,w*.52,h*.46,w*.67);
    backdrop.addColorStop(0,'#15283b');
    backdrop.addColorStop(.7,'#07121f');
    backdrop.addColorStop(1,'#03070e');
    ctx.fillStyle=backdrop;ctx.fillRect(0,0,w,h);
    for(let i=0;i<240;i++){
      const s=(starSeed(i+800)*1.4+.28)*(h/720);
      ctx.fillStyle=`rgba(216,235,255,${.22+starSeed(i+1200)*.7})`;
      ctx.fillRect(starSeed(i+5)*w,starSeed(i+300)*h,s,s);
    }
  }
  globeGrid(size) {
    if(this.globeCanvas.width===size && this.sphereGrid)return this.sphereGrid;
    this.globeCanvas.width=size;
    this.globeCanvas.height=size;
    const axis=Float32Array.from({length:size},(_,i)=>(2*i+1)/size-1);
    const spread=new Float32Array(size*size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const radius=axis[x]*axis[x]+axis[y]*axis[y];
      spread[y*size+x]=radius>1?-1:Math.sqrt(1-radius);
    }
    this.sphereGrid={axis,spread,buffer:this.globeCtx.createImageData(size,size)};
    return this.sphereGrid;
  }
  drawGlobe(t, quality) {
    const {ctx,canvas}=this,w=canvas.width,h=canvas.height,intro=this.project.intro;
    const u=clamp(t/intro.duration,0,1);
    const pace=(easing[intro.pace]||smooth)(u);
    this.drawStars();
    const focus=smooth(clamp((u-.018)/.68,0,1));
    const advance=clamp(.25*u+.75*pace,0,1);
    const cx=w*(.49+.043*Math.sin(Math.PI*u)*(1-u)),cy=h*(.52+.04*Math.sin(Math.PI*u));
    const radius=h*(.29+1.72*advance**3.3);
    const glow=ctx.createRadialGradient(cx,cy,radius*.94,cx,cy,radius*1.13);
    glow.addColorStop(0,'#287caa00');
    glow.addColorStop(.30,'#60cdfca0');
    glow.addColorStop(.52,'#46aeeb40');
    glow.addColorStop(1,'#237bb100');
    ctx.fillStyle=glow;
    ctx.fillRect(0,0,w,h);
    if(!this.earthData) {
      ctx.fillStyle='#1a426a';ctx.beginPath();ctx.arc(cx,cy,radius,0,2*Math.PI);ctx.fill();
      return;
    }
    const size=quality==='preview'?340:canvas.width>1500?760:590;
    const {axis,spread,buffer}=this.globeGrid(size);
    const dst=buffer.data, src=this.earthData.data, tw=this.earthData.width, th=this.earthData.height;
    const latitude=lerp(9,intro.latitude??29,focus)*Math.PI/180;
    const start=intro.start_longitude??-145, end=intro.end_longitude??-81;
    const longitude=(start+(((end-start+540)%360)-180)*focus)*Math.PI/180;
    const camDistance=1+.028+3.15*(1-advance)**2.6;
    const sinLat=Math.sin(latitude),cosLat=Math.cos(latitude), ray=1/Math.sqrt(camDistance**2-1);
    const sunX=.56+.12*Math.sin(u*2), sunY=.37, sunZ=.74-.17*u;
    const minX=clamp(Math.floor((1-cx/radius)*size*.5)-2,0,size-1);
    const maxX=clamp(Math.ceil((1+(w-cx)/radius)*size*.5)+2,0,size);
    const minY=clamp(Math.floor((1-cy/radius)*size*.5)-2,0,size-1);
    const maxY=clamp(Math.ceil((1+(h-cy)/radius)*size*.5)+2,0,size);
    for(let yy=minY;yy<maxY;yy++)for(let xx=minX;xx<maxX;xx++){
      const i=yy*size+xx, index=i*4, edge=spread[i];
      if(edge<0){dst[index+3]=0;continue;}
      const px=axis[xx]*ray, py=-axis[yy]*ray;
      const zRay=(camDistance-edge)/(1+px*px+py*py);
      const x=zRay*px, y=zRay*py, z=camDistance-zRay;
      const lat=Math.asin(clamp(y*cosLat+z*sinLat,-1,1));
      const lon=longitude+Math.atan2(x,z*cosLat-y*sinLat);
      const sx=((Math.floor((lon/(2*Math.PI)+.5)*tw)%tw)+tw)%tw;
      const sy=clamp(Math.floor((.5-lat/Math.PI)*th),0,th-1), texel=(sy*tw+sx)*4;
      const day=smooth(clamp(.43+(x*sunX+y*sunY+z*sunZ)*.79,0,1));
      const rim=(1-edge)**4*(.2+.8*day);
      const light=.23+.84*day;
      const air=day*(1.3-.46*z);
      dst[index]=src[texel]*light+rim*15+air*3;
      dst[index+1]=src[texel+1]*light+rim*58+air*14;
      dst[index+2]=src[texel+2]*(light+.045)+rim*96+air*30;
      dst[index+3]=255*clamp(edge*26,.16,1);
    }
    this.globeCtx.putImageData(buffer,0,0);
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(this.globeCanvas,cx-radius,cy-radius,radius*2,radius*2);
  }
  drawMap(t, camera=this.viewport(t)) {
    const {ctx,canvas}=this,w=canvas.width,h=canvas.height,c=camera;
    ctx.save();
    ctx.fillStyle='#233b3e';ctx.fillRect(0,0,w,h);
    ctx.translate(w/2,h/2);
    ctx.scale(1,Math.cos(c.tilt*Math.PI/180));
    ctx.rotate(c.rotation*Math.PI/180);
    ctx.scale(c.zoom,c.zoom);
    ctx.translate(-c.x*w,-c.y*h);
    if(this.map?.width)ctx.drawImage(this.map,0,0,w,h);
    else {
      ctx.fillStyle='#274a47';ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#496b66';
      for(let x=0;x<w;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    }
    ctx.restore();
    ctx.fillStyle='#05111b17';ctx.fillRect(0,0,w,h);
  }
  drawApproach(t,quality) {
    const {ctx,canvas,project}=this,w=canvas.width,h=canvas.height;
    const intro=project.intro,u=t/intro.duration;
    if(u<.925)this.drawGlobe(t,quality);
    if(u>.785) {
      const crossing=smooth(clamp((u-.785)/.14,0,1)), settle=smooth(clamp((u-.785)/.215,0,1));
      const horizon=lerp(-.28,1.3,crossing)*h;
      const target=this.viewport(intro.duration);
      const coords=project.map.bounds && Geo.pixel(project.map.bounds,intro.latitude??29,intro.end_longitude??-81);
      const pivot=coords||{x:.5,y:.5};
      const c={...target,x:lerp(pivot.x,target.x,settle),
        y:lerp(pivot.y,target.y,settle),tilt:lerp(19,target.tilt,settle),
        zoom:target.zoom*(1+.72*(1-settle)),rotation:target.rotation-8*(1-settle)};
      if(crossing<1) {
        ctx.save();
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(w,0);
        ctx.lineTo(w,horizon+.18*h);ctx.lineTo(0,horizon-.18*h);
        ctx.closePath();ctx.clip();
      }
      this.drawMap(t,c);
      if(crossing<1) {
        ctx.restore();
        ctx.save();
        ctx.translate(w/2,horizon);
        ctx.rotate(Math.atan2(.36*h,w));
        const edge=ctx.createLinearGradient(0,-h*.14,0,h*.14);
        edge.addColorStop(0,'#bddef700');
        edge.addColorStop(.5,'#a1d9ffcc');
        edge.addColorStop(1,'#9ccff300');
        ctx.fillStyle=edge;ctx.fillRect(-w,-h*.14,2*w,h*.28);
        ctx.restore();
      }
    }
    if(u>.24 && u<.86 && intro.place) {
      const x=w*.5,y=h*.52,s=h*.027;
      ctx.save();
      ctx.globalAlpha=smooth(clamp((u-.24)*12,0,1))*(1-smooth(clamp((u-.79)*14,0,1)));
      ctx.strokeStyle='#a3eaff';ctx.lineWidth=Math.max(1,h*.002);
      ctx.beginPath();ctx.arc(x,y,s+Math.sin(u*28)*s*.13,0,2*Math.PI);ctx.stroke();
      ctx.font=`600 ${h*.025}px "Noto Sans CJK SC", sans-serif`;
      ctx.fillStyle='#e6f6ff';ctx.shadowColor='#02090f';ctx.shadowBlur=7;
      const longitude=intro.end_longitude??-81, latitude=intro.latitude??29;
      const region=longitude>-169&&longitude<-52&&latitude>0&&latitude<85?'北美洲':'地理定位';
      const label=u<.44?region:u<.59?(intro.state||region):(intro.city||intro.place);
      ctx.fillText(label,x+s*1.55,y+6,w*.42);
      ctx.restore();
    }
  }
  drawRoute(actor,t,editing=false) {
    const points=Motion.sorted(actor.points);
    if (points.length<2 || (!editing && t<=points[0].t)) return;
    const end=editing?points.at(-1).t:Math.min(t,points.at(-1).t);
    const ctx=this.ctx, coords=[];
    const screen=p=>this.worldToScreen(p.x,p.y,t);
    for (let i=1;i<points.length && points[i-1].t<=end;i++) {
      const a=points[i-1], b=points[i];
      const stop=Math.min(end,b.t);
      const steps=actor.route?8:1;
      for(let step=0;step<=steps;step++) coords.push(screen(this.actorPosition(actor,a.t+(stop-a.t)*step/steps)));
    }
    ctx.save();
    ctx.strokeStyle=hexToRgba(actor.color,editing?1:.76);
    ctx.lineWidth=Math.max(editing?4:2,this.canvas.height*.0034);
    ctx.lineJoin='round';
    ctx.lineCap='round';
    ctx.beginPath();
    coords.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.stroke();
    if (editing) {
      ctx.fillStyle=ctx.strokeStyle;
      for (let i=1;i<points.length;i++) {
        const mid=(points[i-1].t+points[i].t)/2;
        const [x,y]=screen(this.actorPosition(actor,mid)), [nx,ny]=screen(this.actorPosition(actor,mid+.015));
        const angle=Math.atan2(ny-y,nx-x);
        if(Math.hypot(nx-x,ny-y)<.01) continue;
        ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-10,-7); ctx.lineTo(-10,7); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  drawGuide(t,options) {
    const ctx=this.ctx;
    const actor=this.project.actors.find(a=>a.id===options.selectedActor);
    if(actor) {
      this.drawRoute(actor,t,true);
      const points=Motion.sorted(actor.points);
      points.forEach((point,i)=>{
        const shown=options.guideOverride?.point===point?options.guideOverride.next:point;
        const [x,y]=this.worldToScreen(shown.x,shown.y,t);
        const current=point===options.selectedPoint || Math.abs(point.t-t)<.0005;
        ctx.fillStyle=current?'#fff':actor.color||'#61ceff';
        ctx.strokeStyle='#0b1523';
        ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(x,y,current?14:10,0,Math.PI*2); ctx.fill(); ctx.stroke();
        if(i===0 || i===points.length-1) {
          ctx.font='bold 17px "Noto Sans CJK SC",sans-serif';
          ctx.fillStyle='#fff'; ctx.fillText(i===0?'起':'终',x+15,y-13);
        }
      });
    }
    if(options.draft?.length) {
      ctx.strokeStyle='#51ccff'; ctx.lineWidth=5; ctx.lineJoin='round'; ctx.lineCap='round';
      ctx.beginPath();
      options.draft.forEach((p,i)=>{
        const [x,y]=this.worldToScreen(p.x,p.y,t);
        if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      });
      ctx.stroke();
    }
  }
  actorPosition(actor,t) {
    if(!actor.route)return interp(actor.points||[],t,['x','y'],'smooth');
    let prepared=this.frameRoutes?.get(actor);
    if(!prepared && this.frameRoutes) {
      prepared=Motion.prepareRoute(actor);
      this.frameRoutes.set(actor,prepared);
    }
    return Motion.routePosition(actor,t,prepared);
  }
  drawActor(actor, t) {
    const preview=this.actorPreview?.id===actor.id?this.actorPreview.point:null;
    if (!preview && !Motion.visible(actor,t)) return;
    const { ctx, canvas } = this, { width: w, height: h } = canvas;
    const p = preview || this.actorPosition(actor,t), [x,y] = this.worldToScreen(p.x,p.y,t);
    const r = clamp(h*.018*(actor.size || 1),8,h*.08);
    const {angle,moving,motion}=Motion.heading(actor,t,at=>this.actorPosition(actor,at),w,h);
    const camera=this.viewport(t), rad=angle+camera.rotation*Math.PI/180;
    const heading=Math.atan2(Math.sin(rad)*Math.cos(camera.tilt*Math.PI/180),Math.cos(rad));
    const avatar = this.avatars[actor.id]?.image;
    const color = actor.color || '#54c7e9';
    ctx.save();
    ctx.translate(x,y);
    ctx.shadowColor='#000c'; ctx.shadowBlur=r*.65; ctx.shadowOffsetY=r*.25;
    if (actor.kind === 'car') {
      ctx.rotate(heading);
      const length = actor.vehicle === 'pickup' ? 2.03 : actor.vehicle === 'suv' ? 1.9 : actor.vehicle === 'motorcycle' ? 1.08 : 1.68;
      const body = actor.vehicle === 'motorcycle' ? .38 : .66;
      if (avatar?.width) ctx.drawImage(avatar,-r*length,-r,r*length*2,r*2);
      else {
        drawRounded(ctx,-r*length,-r*body,r*length*2,r*body*2,r*.28,color);
        ctx.shadowBlur=0;
        drawRounded(ctx,-r*.63,-r*body*.78,r*1.36,r*body*1.56,r*.18,'#132d40');
        ctx.fillStyle='#fff6d7';
        for (const side of [-1,1]) ctx.fillRect(r*(length-.26),side*r*body*.7-1,r*.16,r*.19);
      }
      if (actor.vehicle === 'police') {
        ctx.shadowBlur=r*.58; ctx.shadowColor=Math.floor(t*8)%2?'#ff4060':'#44bfff';
        drawRounded(ctx,-r*.24,-r*.47,r*.48,r*.94,r*.10,ctx.shadowColor);
      }
    } else {
      drawRounded(ctx,-r,-r,2*r,2*r,r,color);
      ctx.shadowBlur=0;
      ctx.save();
      ctx.beginPath(); ctx.arc(0,0,r*.8,0,Math.PI*2); ctx.clip();
      if (avatar?.width) ctx.drawImage(avatar,-r,-r,2*r,2*r);
      else {
        ctx.fillStyle='#101f2b'; ctx.fillRect(-r,-r,2*r,2*r);
        ctx.translate(0,moving && motion!=='stop' ? Math.sin(t*(motion==='run'?22:12))*r*.1 : 0);
        ctx.fillStyle='#e9f3f7'; ctx.beginPath(); ctx.arc(0,-r*.25,r*.29,0,Math.PI*2); ctx.fill();
        drawRounded(ctx,-r*.45,r*.09,r*.9,r*.62,r*.23,'#e9f3f7');
      }
      ctx.restore();
      ctx.rotate(heading);
      ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(r*1.55,0);
      ctx.lineTo(r*.92,-r*.34); ctx.lineTo(r*.92,r*.34); ctx.fill();
    }
    ctx.restore();
    if (actor.label === false) return;
    const name=String(actor.name || actor.id).slice(0,24), fontSize=Math.max(12,Math.round(h*.021));
    ctx.font=`600 ${fontSize}px "Noto Sans CJK SC", system-ui`;
    const tw=ctx.measureText(name).width, box=h*.035;
    drawRounded(ctx,x-tw/2-8,y+r+6,tw+16,box,5,'#07121dec');
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#f2f7fb';
    ctx.fillText(name,x,y+r+6+box/2);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  }
  drawEvents(t) {
    const { ctx, canvas } = this, { width: w, height: h } = canvas;
    for (const e of this.project.events) {
      if (!active(e,t) || e.type === 'shake' || e.type === 'push') continue;
      const actor=this.project.actors.find(a=>a.id===e.actor);
      const p = actor?.points.length ? this.actorPosition(actor,t) : {x:.5,y:.5};
      const [x,y] = this.worldToScreen(p.x,p.y,t);
      const age=t-e.t, u=age/(e.duration ?? (e.type==='gunfire'?.35:1.1));
      const r=h*.036*(e.size ?? 1), color=e.color || '#ffdd62';
      ctx.save();
      ctx.globalAlpha=(e.intensity??1)*(e.type==='gunfire'?1-u:1);
      ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=h*.0035;
      if (e.type === 'vignette') {
        const gradient=ctx.createRadialGradient(w/2,h/2,h*.22,w/2,h/2,w*.59);
        gradient.addColorStop(0,'transparent');
        gradient.addColorStop(1,e.color || '#000');
        ctx.fillStyle=gradient; ctx.fillRect(0,0,w,h);
      } else if (e.type === 'gunfire') {
        ctx.translate(x,y);
        ctx.beginPath();
        for (let i=0;i<16;i++) {
          const a=i*Math.PI/8, radius=r*(i%2?.28:1-u*.48);
          if (i) ctx.lineTo(Math.cos(a)*radius,Math.sin(a)*radius);
          else ctx.moveTo(Math.cos(a)*radius,Math.sin(a)*radius);
        }
        ctx.closePath(); ctx.fill();
      } else if (e.type === 'text') {
        ctx.font=`700 ${r}px "Noto Sans CJK SC", system-ui`;
        const label=e.text || '事件标记';
        drawRounded(ctx,x-10,y-r*1.7,ctx.measureText(label).width+20,r*1.38,7,'#09151ced');
        ctx.fillStyle=color; ctx.fillText(label,x,y-r*.7);
      } else {
        const offset=e.type==='alert'?r*1.65:0;
        if (e.type==='glow' || e.type==='light' || e.type==='beacon') {
          ctx.shadowBlur=r*1.1; ctx.shadowColor=color;
          if (e.type==='beacon') ctx.strokeStyle=Math.floor(t*9)%2?'#f94e64':'#51bfff';
        }
        ctx.beginPath(); ctx.arc(x,y-offset,r*(e.type==='ring'?1+u*.85:1),0,Math.PI*2); ctx.stroke();
        if (e.type==='alert') {
          ctx.font=`800 ${r*1.56}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText('!',x,y-offset);
        }
      }
      ctx.restore();
    }
  }
  drawHUD(t) {
    const {ctx,canvas}=this, w=canvas.width, h=canvas.height, p=this.project;
    const typeface='"Noto Sans CJK SC", "PingFang SC", sans-serif';
    drawRounded(ctx,w*.026,h*.036,w*.49,h*.097,13,'#07121ded');
    ctx.fillStyle='#f0f7fb';
    ctx.font=`600 ${h*.033}px ${typeface}`;
    ctx.fillText(p.title || '案件地图动画',w*.044,h*.085,w*.454);
    ctx.fillStyle='#7fd5f1';
    ctx.font=`${h*.017}px ${typeface}`;
    ctx.fillText(p.subtitle || p.intro.place || '案件地图动画',w*.044,h*.118,w*.454);
    const caption=p.captions.find(c=>c.start<=t && t<c.end);
    if (caption) {
      ctx.font=`600 ${h*.038}px ${typeface}`;
      const width=Math.min(w*.9,ctx.measureText(caption.text).width);
      drawRounded(ctx,(w-width)/2-20,h*.833,width+40,h*.079,12,'#07111de8');
      ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(caption.text,w/2,h*.872,w*.9);
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    }
    const credit=p.map.credit || (this.mapRef==='assets/demo-map.webp'?'原创示例地图':'用户导入地图');
    ctx.font=`${h*.017}px ${typeface}`;
    ctx.fillStyle='#e8f4f9'; ctx.shadowColor='#000'; ctx.shadowBlur=4;
    ctx.fillText('案件过程示意动画 · 非真实现场画面',w*.025,h*.981,w*.45);
    ctx.textAlign='right';
    const earthCredit=t<p.intro.duration?'NASA Earth Observatory · Blue Marble':'';
    ctx.fillText(earthCredit && t<p.intro.duration*.785?earthCredit:
      earthCredit?earthCredit+' · '+credit:credit,w*.98,h*.981,w*.48);
    ctx.textAlign='left'; ctx.shadowBlur=0;
  }
  render(time,options={}) {
    if(!this.project)return;
    const {ctx,canvas}=this,p=this.project,t=clamp(time,0,p.duration);
    const intro=p.intro.duration;
    this.frameRoutes=new Map();
    this.frameView={time:t,camera:this.viewport(t)};
    try {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if(intro>0 && t<intro) this.drawApproach(t,options.quality);
      else {
        this.drawMap(t);
        if(p.show_tracks!==false)for(const a of p.actors)this.drawRoute(a,t);
        for(const a of [...p.actors].sort((a,b)=>(a.layer??0)-(b.layer??0)))this.drawActor(a,t);
        this.drawEvents(t);
      }
      this.drawHUD(t);
      if(options.editor && t>=intro)this.drawGuide(t,options);
    } finally { this.frameView=null;this.frameRoutes=null; }
  }

}
global.CaseMapEngine={Engine,interp,clamp};
})(globalThis);
