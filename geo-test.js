(function(){
  'use strict';
  const canvas=document.getElementById('screen'),ctx=canvas.getContext('2d');
  let geo,engine,mapCanvas;
  const BOX={west:-81.4945,south:28.4965,east:-81.474,north:28.5165,projection:'geographic'};
  window.setupGeoTest=async(width,height,geoOnly=false)=>{
    canvas.width=width;canvas.height=height;
    const focus=CaseMapGeo.location(BOX,681/1240,609/1240);
    const flight=CaseMapFlight.preset(focus.lat,focus.lon,geoOnly?10:7.2,'奥兰多 · Bill Frederick Park');
    geo=new CaseMapGeoScene.GeoScene(document.getElementById('earth'));
    await geo.use(flight);
    if(geoOnly)return {aerial:geo.aerial};
    mapCanvas=document.createElement('canvas');mapCanvas.width=width;mapCanvas.height=height;
    engine=new CaseMapEngine.Engine(mapCanvas);
    const center=CaseMapGeo.pixel(BOX,focus.lat,focus.lon);
    const coords=[[648,582],[650,600],[661,607],[681,611],[707,622]].map(([x,y])=>({x:x/1240,y:y/1240}));
    engine.setProject({version:1,title:'奥兰多 · 公共停车场',subtitle:'三维地理验证 · 车辆纯示意',duration:2.8,fps:30,size:[width,height],
      intro:{duration:0},map:{image:'assets/geo/orlando-park.webp',credit:'USDA NAIP / USGS The National Map'},
      camera:[{t:0,...center,zoom:4.5,rotation:0}],show_tracks:false,
      actors:[{id:'unit',name:'演示警车',kind:'car',vehicle:'police',size:.8,color:'#48b8ff',
        route:{curve:.65,steering:.6,turnSlow:.6,speed:'linear'},points:CaseMapMotion.schedule(coords,0,2.8,{turnSlow:.6,speed:'linear'})}],
      events:[],captions:[{start:0,end:2.8,text:'停车场 · 车辆动画仅为技术验证'}]});
    await Promise.all([engine.ready(),document.fonts.ready]);
    return {aerial:geo.aerial,webgl:!!geo.scene.context};
  };
  window.geoTestFrame=async t=>{
    const w=canvas.width,h=canvas.height;
    if(engine&&t>=7.2){engine.render(t-7.2);ctx.drawImage(mapCanvas,0,0);}
    else{
      await geo.readyFrame(t);
      geo.paint(ctx,w,h);
      ctx.fillStyle='#07101bdc';ctx.fillRect(w*.035,h*.045,w*.50,h*.098);
      ctx.fillStyle='#f5fbff';ctx.font=`600 ${Math.round(h*.037)}px "Noto Sans CJK SC",sans-serif`;
      ctx.fillText(t<2?'美国 · 三维地理定位':t<4.5?'佛罗里达州 · 奥兰多':'Bill Frederick Park · 奥兰多',w*.052,h*.105);
      ctx.fillStyle='#08101adc';ctx.fillRect(0,h*.951,w,h*.049);
      ctx.fillStyle='#fff';ctx.font=`${Math.round(h*.021)}px "Noto Sans CJK SC",sans-serif`;
      ctx.fillText(geo.credit,w*.029,h*.983);
      ctx.textAlign='right';ctx.fillText('CesiumJS · 公共场所地理验证',w*.97,h*.983);ctx.textAlign='left';
    }
    return canvas.toDataURL('image/jpeg',.94).split(',')[1];
  };
})();
