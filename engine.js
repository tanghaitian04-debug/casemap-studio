/* CaseMap Studio rendering engine — standalone Canvas2D, no network or paid API. */
(function(global){
'use strict';
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
    const c=this.camera(t);
    if (!this.project.map.keepInFrame) return c;
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
  drawStars(){const {ctx,canvas}=this,w=canvas.width,h=canvas.height;ctx.fillStyle='#06101b';ctx.fillRect(0,0,w,h);for(let i=0;i<260;i++){const x=starSeed(i+5)*w,y=starSeed(i+300)*h,s=starSeed(i+800)*1.5+.25;ctx.fillStyle=`rgba(220,239,250,${.3+starSeed(i+1200)*.6})`;ctx.fillRect(x,y,s,s);}}
  drawGlobe(t){const {ctx,canvas}=this,w=canvas.width,h=canvas.height,p=this.project,intro=p.intro||{},u=clamp(t/Math.max(.01,intro.duration||1),0,1);this.drawStars();const cx=w*.5,cy=h*.5,r=Math.min(w,h)*(.265+1.32*u**4);
    const glow=ctx.createRadialGradient(cx,cy,r*.75,cx,cy,r*1.25);glow.addColorStop(0,'#1a6b8b00');glow.addColorStop(.77,'#1686ad40');glow.addColorStop(1,'#2a8fbd00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,r*1.27,0,Math.PI*2);ctx.fill();
    if(this.earthData){const size=Math.min(450,Math.max(128,Math.floor(r*2)));if(this.globeCanvas.width!==size){this.globeCanvas.width=size;this.globeCanvas.height=size;}const img=this.globeCtx.createImageData(size,size),dst=img.data,src=this.earthData.data,tw=this.earthData.width,th=this.earthData.height;
      const lat0=lerp(8, Number(intro.latitude??29), smooth(u))*Math.PI/180,lon0=lerp(Number(intro.start_longitude??-145),Number(intro.end_longitude??-81),smooth(u))*Math.PI/180, distance=lerp(5,1.08,smooth(u)), cosLat=Math.cos(lat0), sinLat=Math.sin(lat0), scale=1/Math.sqrt(distance*distance-1);
      for(let yy=0;yy<size;yy++){const y=-(yy/(size-1)*2-1);for(let xx=0;xx<size;xx++){const x=xx/(size-1)*2-1,rr=x*x+y*y,idx=(yy*size+xx)*4;if(rr>1){dst[idx+3]=0;continue;}const rayX=x*scale, rayY=y*scale; const depth=(distance-Math.sqrt(Math.max(0,1-rr)))/(1+rayX*rayX+rayY*rayY);const ix=depth*rayX, iy=depth*rayY, z=distance-depth,lat=Math.asin(clamp(iy*cosLat+z*sinLat,-1,1)),lon=lon0+Math.atan2(ix,z*cosLat-iy*sinLat),sx=((Math.floor((lon/(2*Math.PI)+.5)*tw)%tw)+tw)%tw,sy=clamp(Math.floor((.5-lat/Math.PI)*th),0,th-1),srcidx=(sy*tw+sx)*4,light=clamp(.48+.60*(.38*x+.40*y+.75*z),.22,1.08);
        dst[idx]=src[srcidx]*light;dst[idx+1]=src[srcidx+1]*light;dst[idx+2]=src[srcidx+2]*light;dst[idx+3]=255;}}
      this.globeCtx.putImageData(img,0,0);ctx.drawImage(this.globeCanvas,cx-r,cy-r,r*2,r*2);
    }else{ctx.fillStyle='#155477';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#5ab7db';ctx.lineWidth=Math.max(2,w*.002);ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  }
  drawMap(t){const {ctx,canvas}=this,w=canvas.width,h=canvas.height,c=this.viewport(t);ctx.save();ctx.fillStyle='#233b3e';ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);ctx.scale(1,Math.cos(c.tilt*Math.PI/180));ctx.rotate(c.rotation*Math.PI/180);ctx.scale(c.zoom,c.zoom);ctx.translate(-c.x*w,-c.y*h);if(this.map?.width){ctx.drawImage(this.map,0,0,w,h);}else{ctx.fillStyle='#274a47';ctx.fillRect(0,0,w,h);for(let x=0;x<w;x+=60){ctx.strokeStyle='#496b66';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}}
    ctx.restore();ctx.fillStyle='#05111b17';ctx.fillRect(0,0,w,h);
  }
  drawRoute(a,t){const pts=[...(a.points||[])].filter(p=>p.t<=t).sort((a,b)=>a.t-b.t);if(pts.length<2)return;const ctx=this.ctx;ctx.strokeStyle=hexToRgba(a.color,.85);ctx.lineWidth=Math.max(2,this.canvas.height*.003);ctx.lineJoin='round';ctx.beginPath();pts.forEach((p,i)=>{const [x,y]=this.worldToScreen(p.x,p.y,t);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();}
  actorPosition(a,t){return interp(a.points||[],t,['x','y'],'smooth');}
  drawActor(actor, t) {
    if (!actor.points.length || t < (actor.start ?? Math.min(...actor.points.map(p => p.t))) || t >= (actor.end ?? Infinity)) return;
    const { ctx, canvas } = this, { width: w, height: h } = canvas;
    const p = this.actorPosition(actor,t), [x,y] = this.worldToScreen(p.x,p.y,t);
    const r = clamp(h*.018*(actor.size || 1),8,h*.08);
    const before = this.actorPosition(actor,t-.08), after = this.actorPosition(actor,t+.08);
    let dx = (after.x-before.x)*w, dy = (after.y-before.y)*h;
    const moving = Math.hypot(dx,dy) > .035;
    if (!moving) {
      const points = [...actor.points].sort((a,b) => a.t-b.t);
      const segments = points.slice(1).map((p,i) => ({ t:p.t, dx:(p.x-points[i].x)*w, dy:(p.y-points[i].y)*h }))
        .filter(seg => Math.hypot(seg.dx,seg.dy) > .01);
      const nearest = segments.filter(seg => seg.t <= t).at(-1) ?? segments[0];
      dx=nearest?.dx ?? 1; dy=nearest?.dy ?? 0;
    }
    const direction = actor.heading === undefined ? Math.atan2(dy,dx) : actor.heading*Math.PI/180;
    const camera = this.camera(t), rad = direction+camera.rotation*Math.PI/180;
    const heading = Math.atan2(Math.sin(rad)*Math.cos(camera.tilt*Math.PI/180),Math.cos(rad));
    const avatar = this.avatars[actor.id]?.image;
    const color = actor.color || '#54c7e9';
    ctx.save();
    ctx.translate(x,y);
    ctx.shadowColor='#000c'; ctx.shadowBlur=r*.65; ctx.shadowOffsetY=r*.25;
    if (actor.kind === 'car') {
      ctx.rotate(heading);
      const length = actor.vehicle === 'suv' ? 1.9 : actor.vehicle === 'motorcycle' ? 1.08 : 1.68;
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
        ctx.translate(0,moving && actor.motion!=='stop' ? Math.sin(t*(actor.motion==='run'?22:12))*r*.1 : 0);
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
    ctx.fillText(credit,w*.98,h*.981,w*.48);
    ctx.textAlign='left'; ctx.shadowBlur=0;
  }
  render(t,options={}){if(!this.project)return;const {ctx,canvas}=this,p=this.project,intro=Number(p.intro?.duration||0);t=clamp(t,0,p.duration);ctx.clearRect(0,0,canvas.width,canvas.height);
    if (intro>0 && t<intro) {
      this.drawGlobe(t);
      const blend=smooth(clamp((t-intro*.83)/(intro*.17),0,1));
      if (blend>0) {
        ctx.save();
        ctx.beginPath(); ctx.arc(canvas.width/2,canvas.height/2,blend*Math.hypot(canvas.width,canvas.height)/2,0,Math.PI*2);
        ctx.clip(); this.drawMap(t); ctx.restore();
      }
      if (p.intro.place) {
        const x=canvas.width/2, y=canvas.height/2;
        ctx.strokeStyle='#8ae8fb'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(x,y,13+Math.sin(t*4)*4,0,Math.PI*2); ctx.stroke();
        ctx.font=`600 ${canvas.height*.026}px "Noto Sans CJK SC", system-ui`;
        ctx.fillStyle='#effbff'; ctx.fillText(p.intro.place,x+23,y+7);
      }
    } else {
      this.drawMap(t);
      if(p.show_tracks!==false) for(const a of p.actors) this.drawRoute(a,t);
      for(const a of [...p.actors].sort((a,b)=>(a.layer??0)-(b.layer??0))) this.drawActor(a,t);
      this.drawEvents(t);
    }
    this.drawHUD(t);
    if(options.editor&&options.selectedActor&&t>=intro){const a=(p.actors||[]).find(a=>a.id===options.selectedActor);if(a){ctx.save();for(const point of a.points||[]){const [x,y]=this.worldToScreen(point.x,point.y,t);ctx.fillStyle=point.t<=t?'#7fe3ff':'#fff9';ctx.strokeStyle='#07121c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.restore();}}
  }
}
global.CaseMapEngine={Engine,interp,clamp};
})(globalThis);
