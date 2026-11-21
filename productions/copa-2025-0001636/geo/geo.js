import {g,W,H,color,text,circ,line,fade,rect,credit,gradient,json,compass} from '../scripts/draw.js';
let C,widget,scene,data,stars,buildingLayer;
const buildingPaints=[];
const seconds=32;
function angles(keys,t){
  if(t<=keys[0][0])return keys[0].slice(1);
  const i=keys.findIndex(k=>k[0]>=t);
  if(i<0)return keys.at(-1).slice(1);
  const a=keys[i-1],b=keys[i],prev=keys[i-2]||a,next=keys[i+1]||b;
  const dt=b[0]-a[0],u=(t-a[0])/dt;
  return a.slice(1).map((y,k)=>{
    const j=k+1,z=b[j],d=(z-y)/dt;
    const p=prev===a?0:(y-prev[j])/(a[0]-prev[0]);const q=next===b?0:(next[j]-z)/(next[0]-b[0]);
    const tangent=(x,s)=>x*s<=0?0:2*x*s/(x+s);
    return (2*u**3-3*u*u+1)*y+(u**3-2*u*u+u)*dt*tangent(p,d)+(-2*u**3+3*u*u)*z+(u**3-u*u)*dt*tangent(d,q);
  });
}
const flight=[
 [0,-125,28,20400000,0,-89.9], [3.5,-117,32,17900000,-2,-89.9],
 [7,-104,37,6400000,-3,-89.9],[10,-94,40.3,2500000,-2,-89.9],
 [13,-89.4,41.24,650000,0,-89.8],[16,-87.79,41.75,98000,1,-88],
 [19,-87.636,41.878,10200,1,-82],[22,-87.630,41.889,2100,-13,-65],
 [24.5,-87.627284,41.890073,850,-15,-54],[27,-87.627284,41.890073,650,17,-56],
 [29.5,-87.627284,41.890073,560,5,-79],[31,-87.627284,41.890073,540,0,-89.99],
 [seconds,-87.627284,41.890073,540,0,-89.99]
].map(([t,lon,lat,r,h,p])=>[t,lon,lat,Math.log(r),h,p]);
function makeStars(){
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');let x=37;
  const rnd=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<710;i++){
    const xx=rnd()*W,yy=rnd()*H,r=rnd();
    ctx.fillStyle='rgba(188,214,239,'+(0.08+rnd()*.59)+')';
    ctx.beginPath();ctx.arc(xx,yy,r<.93?.45+r*.48:1.12,0,2*Math.PI);ctx.fill();
  }
  return canvas;
}
async function addBuildings(){
  if(!data.buildingCount)return;
  const buildings=await json('/geo/models.json');
  const items=[];
  for(const row of buildings){
    for(const polygon of row.polygons){
      const ring=polygon[0];
      const positions=C.Cartesian3.fromDegreesArray(ring.slice(0,-1).flat());
      if(positions.length<3)continue;
      const holes=polygon.slice(1).map(r=>new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(r.slice(0,-1).flat())));
      const poly=new C.PolygonGeometry({polygonHierarchy:new C.PolygonHierarchy(positions,holes),height:0,
        extrudedHeight:row.height,vertexFormat:C.PerInstanceColorAppearance.VERTEX_FORMAT});
      const paint=row.hotel? '#b89977' : ['#667780','#75818a','#898c8b','#6d777b'][row.shade];
      const id=row.id+"-"+items.length;
      const tone=C.Color.fromCssColorString(paint);
      buildingPaints.push([id,tone]);
      items.push(new C.GeometryInstance({id, geometry:poly,
        attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(tone)}}));
    }
  }
  buildingLayer=scene.primitives.add(new C.Primitive({geometryInstances:items,asynchronous:false,
    appearance:new C.PerInstanceColorAppearance({closed:true,flat:false,translucent:true}),show:false}));
}
export async function setup(){
  data=await json('/geo/metadata.json');stars=makeStars();
  window.CESIUM_BASE_URL='/cesium/';
  await new Promise((ok,fail)=>{
    const s=document.createElement('script');s.src='/cesium/Cesium.js';s.onload=ok;s.onerror=fail;document.head.append(s);
  });
  C=window.Cesium;
  widget=new C.CesiumWidget(document.querySelector('#globe'),{
    baseLayer:false,useDefaultRenderLoop:false,skyBox:false,scene3DOnly:true,msaaSamples:1,
    terrainProvider:new C.EllipsoidTerrainProvider(),
    contextOptions:{webgl:{alpha:true,preserveDrawingBuffer:true,antialias:false}}
  });
  scene=widget.scene;scene.backgroundColor=C.Color.TRANSPARENT;
  scene.globe.baseColor=C.Color.fromCssColorString('#173a51');
  scene.globe.enableLighting=true;scene.globe.dynamicAtmosphereLighting=false;
  scene.globe.showGroundAtmosphere=true;scene.globe.lightingFadeOutDistance=200000000;
  scene.fog.enabled=false;if(scene.sun)scene.sun.show=false;if(scene.moon)scene.moon.show=false;
  scene.globe.maximumScreenSpaceError=2.5;
  scene.screenSpaceCameraController.enableInputs=false;
  widget.clock.shouldAnimate=false;widget.clock.currentTime=C.JulianDate.fromIso8601('2025-04-07T18:12:00Z');
  scene.light=new C.DirectionalLight({direction:C.Cartesian3.normalize(new C.Cartesian3(-.2,.8,-.65),new C.Cartesian3()),intensity:1.4});
  const layers=await Promise.all(data.layers.map(({file,bounds})=>C.SingleTileImageryProvider.fromUrl('/geo/'+file,
    {rectangle:C.Rectangle.fromDegrees(...bounds)})));
  layers.forEach((p,i)=>{
    const layer=scene.imageryLayers.addImageryProvider(p);
    layer.brightness=i===0?1.24:.86;layer.saturation=i===0?.90:.76;layer.contrast=i===0?1.02:1.07;
  });
  await addBuildings();widget.resize();
}
const cards=[
  [0,5.4,'地球','EARTH'],[5.4,8.6,'北美洲','NORTH AMERICA'],[8.6,11.7,'美国','UNITED STATES'],
  [11.7,15.3,'伊利诺伊州','ILLINOIS'],[15.3,19.3,'芝加哥','CHICAGO'],
  [19.3,22.4,'里弗诺斯','RIVER NORTH'],[22.4,25.0,'东哈伯德街','E HUBBARD ST'],
  [25,30.9,'30 E Hubbard St','COURTYARD BY MARRIOTT']
];
function title(t){
  for(const [a,b,cn,en] of cards){
    if(t<a||t>b)continue;
    const opacity=fade(t,a,a+.63)*(1-fade(t,b-.68,b));
    g.save();g.globalAlpha=opacity;
    g.fillStyle=gradient(60,0,750,0,[[0,'#071218cc'],[1,'#07121800']]);g.fillRect(0,716,800,295);
    line([[84,835],[151,835]],color.amber,4);
    text(cn,84,918,64,color.ink,700);
    text(en,86,964,24,color.sub,700);
    g.restore();
  }
}
function project(lon,lat,height=0){return C.SceneTransforms.worldToWindowCoordinates(scene,C.Cartesian3.fromDegrees(lon,lat,height));}
function road(lon,lat,name){
  const p=project(lon,lat);if(!p||p.x<310||p.x>1680||p.y<120||p.y>760)return;
  g.font='700 21px Film';const m=g.measureText(name).width;
  rect(p.x-m/2-11,p.y-23,m+22,33,'#101b23b9',null,3);
  text(name,p.x,p.y,21,'#e2eef2',700,'center');
}
function hotel(t){
  const [lon,lat]=data.mapHotel;
  const top=(data.hotelHeight||0)*(1-fade(t,29.0,30.7));
  const p=project(lon,lat,top);
  if(!p||p.x<200||p.x>1700||p.y<160||p.y>830)return;
  const {x,y}=p;
  g.save();g.globalAlpha=fade(t,22.5,24.9)*(1-.27*fade(t,30.2,31.3));
  const pulse=1+Math.sin(t*3.1)*.16;
  circ(x,y,37*pulse,'#f8c78313','#f8c78365',2);
  circ(x,y,13,'#12212b','#ffd292',3);circ(x,y,4,'#ffd292');
  line([[x+10,y-10],[x+80,y-82],[x+231,y-82]],'#ffd292',2);
  rect(x+224,y-111,346,67,'#0d1821ed','#ffd2927c',5);
  text('COURTYARD  /  30 E HUBBARD',x+243,y-70,21,'#f8d4a3',700);
  g.restore();
}
export async function frame(t){
  const [lon,lat,r,heading,pitch]=angles(flight,t);
  const aim=C.Cartesian3.fromDegrees(lon,lat,0);
  scene.camera.lookAt(aim,new C.HeadingPitchRange(C.Math.toRadians(heading),C.Math.toRadians(pitch),Math.exp(r)));
  if(buildingLayer){
    buildingLayer.show=t>=20.7&&t<30.7;
    const alpha=fade(t,20.7,22.9)*(1-fade(t,29.0,30.7));
    if(buildingLayer.ready&&buildingLayer.show){
      for(const [id,tone] of buildingPaints){
        const attr=buildingLayer.getGeometryInstanceAttributes(id);
        attr.color=C.ColorGeometryInstanceAttribute.toValue(tone.withAlpha(alpha),attr.color);
      }
    }
  }
  widget.render();
  for(let i=0;!scene.globe.tilesLoaded;i++){
    if(i>=120)throw Error('USGS imagery not ready at '+t.toFixed(3));
    await new Promise(requestAnimationFrame);widget.render();
  }
  g.fillStyle=gradient(200,0,1740,1080,[[0,'#030713'],[1,'#0c1a2d']]);g.fillRect(0,0,W,H);
  if(t<14){g.save();g.globalAlpha=1-fade(t,9,14);g.drawImage(stars,0,0);g.restore();}
  g.drawImage(scene.canvas,0,0,W,H);
  title(t);
  if(t>22){
    g.save();g.globalAlpha=fade(t,22,24);
    road(-87.62862,41.890125,'E Hubbard St');
    road(-87.62803,41.89161,'N State St');
    road(-87.62629,41.88909,'N Wabash Ave');g.restore();
    hotel(t);
  }
  if(t>30){g.save();g.globalAlpha=fade(t,30,31);compass();g.restore();}
  credit(t<10.5?'NASA Goddard · Blue Marble':t<20.7?'NASA Blue Marble  /  USDA NAIP · USGS The National Map':
    buildingLayer?'USDA NAIP · USGS  /  © OpenStreetMap contributors · openstreetmap.org/copyright  /  部分楼高估算':'USDA NAIP · USGS The National Map  /  正射航拍');
}
