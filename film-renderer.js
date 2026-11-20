(function(root){
  'use strict';
  const Film=root.CaseMapDocumentary;
  const TILE='assets/demo-map.webp';
  const degrees=(angle)=>angle*Math.PI/180;
  function wait(target,done,description) {
    return new Promise((resolve,reject)=>{
      const finish=(error)=>{
        clearTimeout(timeout);
        target.removeEventListener(done,onReady);
        target.removeEventListener('error',onError);
        if(error)reject(error);else resolve();
      };
      const onReady=()=>finish(),onError=()=>finish(Error(description+'无法解码'));
      const timeout=setTimeout(()=>finish(Error(description+'等候超时')),15000);
      target.addEventListener(done,onReady,{once:true});target.addEventListener('error',onError,{once:true});
    });
  }
  let cesiumCode;
  function cesium() {
    if(!cesiumCode){
      const load=src=>new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=src;
        script.onload=resolve;script.onerror=()=>reject(Error('无法加载 '+src));document.head.append(script);
      });
      root.CESIUM_BASE_URL='cesium/';
      cesiumCode=load('cesium/Cesium.js').then(()=>load('geo-scene.js')).catch(error=>{cesiumCode=null;throw error;});
    }
    return cesiumCode;
  }
  class FilmRenderer {
    constructor(canvas,geoNode,assetURL) {
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
      this.geoNode=geoNode;this.assetURL=assetURL;
      this.mapCanvas=document.createElement('canvas');
      this.media=new Map();
      this.layers=new Map();
    }
    async prepare(project) {
      this.project=Film.validate(project);
      this.canvas.width=project.width;this.canvas.height=project.width*9/16;
      this.mapCanvas.width=this.canvas.width;this.mapCanvas.height=this.canvas.height;
      const images=new Map();
      const loadImage=async ref=>{
        const asset=ref==='assets/demo-map.jpg'?TILE:ref;
        if(!images.has(asset))images.set(asset,(async()=>{
          const image=new Image();image.src=asset;await image.decode();return image;
        })());
        return images.get(asset);
      };
      this.engine=new root.CaseMapEngine.Engine(this.mapCanvas,{loadImage});
      this.currentMap=null;this.currentFlight=null;
      for(const video of this.media.values())if(video instanceof HTMLVideoElement)video.pause();
      this.media.clear();
      const referenced=new Set(project.scenes.map(scene=>scene.asset).filter(Boolean));
      await Promise.all([...referenced].map(async id=>{
        const asset=project.assets[id];
        const url=this.assetURL(id,asset);
        if(!url)throw Error('缺少素材：'+asset.name);
        const item=asset.kind==='video'?document.createElement('video'):new Image();
        if(item instanceof HTMLVideoElement){
          item.muted=true;item.playsInline=true;item.preload='auto';
          const ready=wait(item,'loadeddata','视频 '+asset.name);item.src=url;item.load();await ready;
        }else{item.src=url;await item.decode();}
        this.media.set(id,item);
      }));
      if(project.scenes.some(scene=>scene.type==='GlobeScene')){
        await cesium();
        this.geoNode.style.width=this.canvas.width+'px';this.geoNode.style.height=this.canvas.height+'px';
        this.globe ||=new root.CaseMapGeoScene.GeoScene(this.geoNode);
      }
      await document.fonts.ready;
    }
    typeface(size,weight=500) {return weight+' '+Math.round(size)+'px "Noto Sans CJK SC","PingFang SC",sans-serif';}
    lines(message,width,maxLines) {
      const result=[];let line='';
      for(const c of String(message)){
        if(c==='\n'||this.ctx.measureText(line+c).width>width) {
          result.push(line);line=c==='\n'?'':c;
          if(result.length===maxLines)return result;
        } else line+=c;
      }
      if(line)result.push(line);
      return result;
    }
    card(s,w,h) {
      const ctx=this.ctx;
      const gradient=ctx.createLinearGradient(0,0,w,h);
      gradient.addColorStop(0,'#101d32');gradient.addColorStop(1,'#050a13');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#6fd9f8';ctx.fillRect(w*.08,h*.31,w*.041,h*.006);
      ctx.font=this.typeface(h*.067,700);ctx.fillStyle='#f0f6fd';
      const lines=this.lines(s.title,w*.84,3);
      lines.forEach((line,i)=>ctx.fillText(line,w*.08,h*(.43+i*.086)));
      if(this.project.fictional){
        ctx.font=this.typeface(h*.025);ctx.fillStyle='#8fc1d6';
        ctx.fillText('虚构案例 · 纪录片流程演示',w*.08,h*.27);
      }
    }
    async drawMedia(s,local,w,h) {
      const ctx=this.ctx,item=this.media.get(s.asset);
      if(item instanceof HTMLVideoElement){
        const t=Math.max(0,Math.min(s.in+local,Math.max(0,item.duration-.034)));
        if(Math.abs(item.currentTime-t)>.002){
          const result=wait(item,'seeked','视频定位');item.currentTime=t;await result;
        }
      }
      const sw=item.videoWidth||item.naturalWidth, sh=item.videoHeight||item.naturalHeight;
      const factor=Math.min(w/sw,h/sh)*s.zoom;
      const aw=sw*factor,ah=sh*factor;
      ctx.fillStyle='#080e17';ctx.fillRect(0,0,w,h);
      ctx.save();
      if(s.mask){ctx.beginPath();ctx.rect(s.mask.x*w,s.mask.y*h,s.mask.w*w,s.mask.h*h);ctx.clip();}
      ctx.drawImage(item,(w-aw)/2+s.x*w*.48,(h-ah)/2+s.y*h*.48,aw,ah);
      ctx.restore();
      if(s.arrow){
        ctx.save();
        ctx.translate(s.arrow.x*w,s.arrow.y*h);
        ctx.rotate(degrees(34));
        ctx.fillStyle='#f54a4d';ctx.beginPath();
        const k=h*.035;
        ctx.moveTo(0,0);ctx.lineTo(-k,-k*.55);ctx.lineTo(-k,-k*.18);ctx.lineTo(-2.15*k,-k*.18);
        ctx.lineTo(-2.15*k,k*.18);ctx.lineTo(-k,k*.18);ctx.lineTo(-k,k*.55);ctx.closePath();ctx.fill();
        ctx.restore();
      }
      return this.project.assets[s.asset].credit;
    }
    async draw(time,{realtime=false}={}) {
      const {scene:s,local,index}=Film.at(this.project,time);
      const {ctx,canvas}=this,w=canvas.width,h=canvas.height;
      let credit='';
      if(s.type==='GlobeScene'){
        if(this.currentFlight!==s.flight){await this.globe.use(s.flight);this.currentFlight=s.flight;}
        if(realtime && this.lastShot===s.id)this.globe.step(local);
        else await this.globe.readyFrame(local);
        this.globe.paint(ctx,w,h);credit=this.globe.credit;
        if(!this.globe.aerial)credit+=' · 此处仅有全球地表';
      } else if(s.type==='MapScene'||s.type==='ReconstructionScene'){
        if(this.currentMap!==s.map){
          this.engine.setProject(s.map);this.currentMap=s.map;await this.engine.ready();
        }
        this.engine.render(Math.min(s.map.duration,s.in+local));
        ctx.drawImage(this.mapCanvas,0,0,w,h);
      } else if(s.type==='FootageScene'||s.type==='ImageScene') credit=await this.drawMedia(s,local,w,h);
      else this.card(s,w,h);
      this.lastShot=s.id;
      if(s.transition==='fade'&&index>0&&local<.42){
        ctx.fillStyle='rgba(5,9,15,'+Math.max(0,.65*(1-local/.42))+')';ctx.fillRect(0,0,w,h);
      }
      const caption=s.subtitleCues?.find(c=>local>=c.start&&local<c.end)?.text || s.caption;
      this.overlay(s,caption,credit,w,h);
      return {type:s.type,aerial:s.type==='GlobeScene'&&this.globe.aerial};
    }
    overlay(s,caption,credit,w,h) {
      const ctx=this.ctx;
      const voice=this.project.assets[this.project.voice]?.credit?.includes('AI 合成')?'AI 合成旁白':'';
      const source=[credit.trim(),voice].filter(Boolean).join(' · ');
      if(['FootageScene','GlobeScene','ImageScene'].includes(s.type)){
        ctx.fillStyle='#071322dc';ctx.fillRect(w*.034,h*.038,w*.50,h*.083);
        ctx.font=this.typeface(h*.036,700);ctx.fillStyle='#ecf7ff';
        ctx.fillText(s.title,w*.052,h*.092,w*.459);
      }
      if(caption){
        ctx.font=this.typeface(h*.034,700);
        const lines=this.lines(caption,w*.86,3);
        const y=h*(.91-.049*lines.length);
        ctx.fillStyle='#050d18eb';ctx.fillRect(w*.044,y-h*.015,w*.912,h*(.039+.048*lines.length));
        ctx.fillStyle='#f6fbff';ctx.textAlign='center';
        lines.forEach((line,i)=>ctx.fillText(line,w*.5,y+h*(.027+i*.048)));
        ctx.textAlign='left';
      }
      if(source||this.project.fictional){
        ctx.fillStyle='#060d17ed';ctx.fillRect(0,h*.956,w,h*.044);
        ctx.font=this.typeface(h*.020);ctx.fillStyle='#e0eff7';
        if(this.project.fictional)ctx.fillText('虚构演示 · '+(s.type==='FootageScene'?'模拟录像':'画面示意'),w*.035,h*.984,w*.38);
        ctx.textAlign='right';ctx.fillText(source,w*.966,h*.984,w*.56);ctx.textAlign='left';
      }
    }
    destroy(){this.globe?.destroy();}
  }
  root.CaseMapFilmRenderer={FilmRenderer};
})(globalThis);
