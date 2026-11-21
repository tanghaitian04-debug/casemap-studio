import {W,H,g,color,text,rect,line,circ,arrow,credit,compass,gradient,fade,mix,clamp,smooth,json,image} from '../scripts/draw.js';

let scenes,geo,basemap,hubbard,roads;
const mapSource='USDA NAIP · USGS  /  © OpenStreetMap contributors · openstreetmap.org/copyright';
const amber=color.amber, cyan=color.cyan;
const paper='#0b161f', border='#344951';
const person=[['W',amber,'Demond Williams'],['P',cyan,'警员'],['T','#b9adff','电击警员'],['S','#ff9b8d','开枪警员']];
const anchor={x:1180,y:510};
const zoom={
  overview:[-87.62945,41.89039,.015,.012],
  alley:[-87.62962,41.89023,.0105,.0083],
  store:[-87.62816,41.89039,.006,.0049],
  street:[-87.62777,41.89010,.0052,.0043],
  hotel:[-87.62753,41.89016,.00435,.0036],
  inside:[-87.62750,41.89025,.0038,.00335],
  sequence:[-87.62750,41.89025,.0038,.00335],
  after:[-87.62750,41.89025,.0050,.0043],
};
export async function setup(){
  [scenes,geo,basemap,hubbard,roads]=await Promise.all([
    json('/reconstruction/scenes.json'),json('/geo/metadata.json'),
    image('/geo/chicago.jpg'),image('/geo/hubbard.jpg'),json('/geo/roads.json')
  ]);
}
function actor(type,x,y,{scale=1,label,flip=false,down=false,tint}={}){
  const [initial,c,name]=person[type];
  g.save();g.translate(x,y);g.scale(scale,scale);
  circ(0,0,38,(tint||c)+'25');
  circ(0,0,28,'#14232c',tint||c,4);
  text(down?'W':initial,0,10,24,tint||c,700,'center');
  if(down)line([[-20,34],[20,34]],color.red,4);
  if(label){
    g.font='700 19px Film';const width=g.measureText(label===true?name:label).width+24;
    const at=flip?-width-37:37;
    rect(at,-17,width,34,'#0d1823ec','#43535e',5);
    text(label===true?name:label,at+12,7,19,color.ink,700);
  }
  g.restore();
}
function stage(s,t,u){
  const st=zoom[s.map];
  const prev=zoom[scenes[Math.max(0,scenes.indexOf(s)-1)].map];
  const q=s.map==='overview'?1:fade(t,s.at-0.01,s.at+2.8);
  const v=st.map((n,i)=>mix(prev[i],n,q));
  const w=mix(s.map==='overview'?st[2]:prev[3],mix(st[2],st[3],smooth(u)),q);
  const sy=w*.418;
  const px=(lon,lat)=>[anchor.x+(lon-v[0])/w*W,anchor.y-(lat-v[1])/sy*H];
  function layer(img,[left,bottom,right,top]){
    const p=px(left,top),d=px(right,bottom);
    g.drawImage(img,p[0],p[1],d[0]-p[0],d[1]-p[1]);
  }
  g.fillStyle='#1a2d37';g.fillRect(0,0,W,H);
  layer(basemap,geo.layers[2].bounds);
  g.save();g.globalAlpha=1-fade(w,.009,.012);layer(hubbard,geo.layers[3].bounds);g.restore();
  g.fillStyle='#1227362b';g.fillRect(0,0,W,H);
  const mapRoads=new Set(['East Hubbard Street','West Hubbard Street','North State Street','North Dearborn Street','North Wabash Avenue','East Illinois Street','West Illinois Street']);
  g.save();g.globalAlpha=.57;
  for(const road of roads){
    if(!mapRoads.has(road.name))continue;
    const points=road.points.map(p=>px(...p));
    line(points,'#607a8b',9);
    line(points,'#d4e5ec',2);
  }
  g.restore();
  const streets=[
    [-87.63136,41.89011,'W Hubbard St'],[-87.62687,41.89013,'E Hubbard St'],
    [-87.62799,41.89148,'N State St'],[-87.62939,41.89108,'N Dearborn St'],
    [-87.62630,41.88940,'N Wabash Ave'],[-87.62888,41.88713,'Chicago River']
  ];
  for(const [lon,lat,label] of streets){
    const [x,y]=px(lon,lat);if(x<600||x>1790||y<130||y>925)continue;
    g.font='700 19px Film';
    const width=g.measureText(label).width+24;
    rect(x-width/2,y-21,width,29,'#0b1722aa',null,4);
    text(label,x,y,19,color.ink,700,'center');
  }
  return px;
}
function marker(x,y,t,label,detail,style='amber',direction=1){
  const c=style==='red'?color.red:amber;
  if(x<510||x>1840||y>920||y<95)return;
  circ(x,y,26+3*Math.sin(t*3),c+'32',c+'99',2);
  circ(x,y,11,paper,c,3);circ(x,y,4,c);
  const w=detail?323:282;
  const x0=direction===1?x+56:x-56-w;
  const y0=y-128;
  line([[x,y],[x+direction*42,y-74],[x+direction*56,y-74]],c,2);
  rect(x0,y0,w,detail?72:51,'#0b1822ef',c+'a0',6);
  text(label,x0+17,y0+31,22,color.ink,700);
  if(detail)text(detail,x0+17,y0+56,18,color.sub);
}
function electrical(x,y,t){
  const amp=clamp(1-t*1.8);
  if(!amp)return;
  circ(x,y,25+43*(1-amp),'#fac88522','#f8c783'+Math.round(amp*255).toString(16).padStart(2,'0'),2);
  circ(x,y,28,'#231c277f','#f8c783',2);
  const pts=[[x+2,y-19],[x-10,y+2],[x-1,y+2],[x-4,y+18],[x+12,y-6],[x+2,y-6]];
  g.beginPath();pts.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();
  g.fillStyle=amber;g.fill();
}
function box(x,y,w,h,title){
  rect(x,y,w,h,'#0b1723ec',border,9);
  text(title,x+23,y+34,18,'#bacbd4',700);
}
function outdoors(s,t,u,px){
  const hotel=px(...geo.mapHotel),store=px(...geo.store),pursuit=px(...geo.pursuit);
  if(s.map==='overview'){
    marker(...pursuit,t,'54 W Hubbard St','追捕报告 1 登记的起点','amber');
    const q=fade(u,.24,.8);
    box(860,714,623,155,'追赶关系示意');
    actor(1,1018+q*49,811,{scale:.8});
    arrow(1100,811,1190,811,color.red,[5,9],3);
    actor(0,1257+q*68,811,{scale:.8,label:'Williams'});
    return;
  }
  if(s.map==='alley'){
    box(805,272,984,551,'后巷 · 路线与方向为抽象示意');
    rect(865,409,854,278,'#22323d','#50616e',3);
    rect(865,409,854,33,'#334853');
    rect(865,654,854,33,'#334853');
    [[934,463],[999,463],[1510,625],[1576,625]].forEach(([x,y])=>rect(x,y,53,25,'#506475','#8a9d9f',3));
    text('垃圾箱',950,527,19,color.sub);line([[970,501],[966,490]],color.sub,1);
    const q=fade(u,.09,.82);
    const wx=mix(1080,1450,q),px=mix(938,1270,q);
    arrow(978,572,1569,572,color.red,[10,15],3,18);
    actor(0,wx,550,{label:'Williams'});
    actor(1,px,604,{label:'警员',flip:true});
    if(u>.50&&u<.81){
      electrical(1551,526,0);
      text('电击设备使用',1536,598,20,color.sub,700,'center');
    }
    return;
  }
  if(s.map==='store'){
    marker(...store,t,'7-Eleven','451 N State St · 商户地图点');
    box(790,725,987,140,'第三方监控 · 店内移动示意');
    text('街面',1046,804,24,color.sub,700);
    arrow(1144,796,1400,796,color.red,[8,12],3);
    text('店内',1461,804,24,color.sub,700);
    actor(0,mix(1179,1373,fade(u,.15,.71)),796,{scale:.72});
    return;
  }
  if(s.map==='street'){
    box(843,672,890,170,'电击设备使用 · 施放位置为示意');
    actor(2,995,771,{label:true,scale:.88});
    actor(0,1518,771,{label:'Williams',scale:.88,flip:true});
    if(u>.18&&u<.78)electrical(1264,770,Math.max(0,t-s.at-2.25));
    if(u>.51)text('地点范围见证据对照',1270,807,18,color.sub,400,'center');
    return;
  }
  if(s.map==='hotel'){
    marker(...hotel,t,'Courtyard by Marriott','30 E Hubbard St · 酒店位置','red');
    const opacity=fade(u,.10,.35);
    if(opacity>0){
      g.save();g.globalAlpha=opacity;
      box(838,730,917,145,'酒店门口 · 进入关系示意');
      const q=fade(u,.25,.83);
      text('街面',916,821,22,color.sub);
      arrow(1060,813,1495,813,color.red,[7,12],3);
      text('酒店内',1590,821,22,color.sub);
      actor(0,mix(1110,1450,q),795,{scale:.77});
      actor(1,mix(1032,1372,q),831,{scale:.77});
      g.restore();
    }
    return;
  }
  if(s.map==='after'){
    marker(...hotel,t,'Courtyard by Marriott','30 E Hubbard St','red');
    return;
  }
}
function indoor(s,t,u){
  const enter=s.map==='inside'?fade(t,s.at,s.at+2.3):1;
  const exit=s.map==='after'?1-fade(t,105,111):1;
  const alpha=enter*exit;
  if(alpha<=0)return;
  g.save();g.globalAlpha=alpha;
  const zoom=s.map==='sequence'?mix(1,1.095,fade(u,0,.34)):1;
  g.translate(1290,530);g.scale(zoom,zoom);g.translate(-1290,-530);
  rect(686,209,1115,663,'#0a1620ef','#4a6372',12);
  text('非按比例抽象示意',728,263,24,amber,700);
  line([[729,287],[1752,287]],'#384c58',1);
  for(let i=0;i<15;i++)line([[730+i*73,304],[730+i*73,823]],'#26374466',1);
  for(let i=0;i<8;i++)line([[729,312+i*73],[1752,312+i*73]],'#26374466',1);
  rect(794,410,275,288,'#253744','#8fadb9',6);
  rect(1065,479,8,145,'#9fb8bf');
  line([[1036,524],[1036,479],[1066,479]],'#a7bdc9',2);
  line([[1036,578],[1036,624],[1066,624]],'#a7bdc9',2);
  text('电梯区域',931,452,27,color.ink,700,'center');
  text('电梯外区域',1438,408,27,color.ink,700,'center');
  let wx=985,wy=556,fallen=false,aid=0;
  const onset=t-90;
  if(s.map==='sequence'){
    // Relative to the re-opening of the elevator in BWC 2 (about 04:25.8).
    wx=mix(985,1145,fade(onset,.25,1.26))-mix(0,163,fade(onset,1.53,2.67));
    fallen=onset>=2.67;
    if(onset>.25&&onset<1.47)arrow(1051,603,1180,603,color.red,[8,12],3);
    if(onset>1.53&&onset<3.3)arrow(1143,642,1000,642,color.red,[8,12],3);
  }
  if(s.map==='after'){
    aid=fade(t,99,103.25);fallen=true;wx=mix(985,1112,aid);
  }
  actor(0,wx,wy,{label:'Williams',flip:true,down:fallen});
  actor(2,1305,465,{label:true});
  actor(3,1515,508,{label:'开枪警员 A'});
  actor(3,1536,659,{label:'开枪警员 B'});
  actor(1,mix(1437,1235,aid),mix(747,606,aid),{label:s.map==='after'?'救助警员':'其他警员'});
  if(s.map==='inside' && u>.23){
    arrow(1341,592,1181,592,'#a8bcc5',[4,9],2,12);
    text('警方喊话',1293,627,23,color.sub,700,'center');
  }
  if(s.map==='sequence'&&onset>=0){
    const elapsed=Math.min(onset,2.67);
    text('T+'+elapsed.toFixed(1)+' 秒 · 以电梯门打开为起点',1722,263,18,color.sub,700,'right');
    if(onset>=1.23&&onset<1.8)electrical(1231,483,onset-1.23);
    if(onset>=1.50){
      if(onset<1.65){
        const a=1-fade(onset,1.50,1.65);
        circ(1269,560,22+43*(1-a),'#ff926826','#ffb19b'+Math.round(a*255).toString(16).padStart(2,'0'),3);
      }
      if(onset<2.98){
        rect(1105,707,306,49,'#803a35ec','#ff877a',5);
        text('两名警员开枪',1258,739,22,color.ink,700,'center');
      }
    }
    if(onset>=2.67)text('Williams 倒回电梯区域',1480,821,21,color.sub,700,'center');
  }
  if(s.map==='after'&&aid>.3){
    circ(1183,737,24,'#263e42','#94e0cf',2);
    line([[1172,737],[1194,737]],'#94e0cf',4);
    line([[1183,726],[1183,748]],'#94e0cf',4);
    text('现场救助',1220,744,21,'#b5f0e1',700);
  }
  g.restore();
}
function editorial(s,t){
  g.fillStyle=gradient(0,0,694,0,[[0,'#09141df9'],[.74,'#09141df2'],[1,'#09141d00']]);g.fillRect(0,0,760,H);
  g.fillStyle=gradient(0,0,0,157,[[0,'#08141ce3'],[1,'#0a151e00']]);g.fillRect(0,0,W,165);
  g.fillStyle=gradient(0,946,0,1080,[[0,'#0a151e00'],[1,'#0a151eeb']]);g.fillRect(0,946,W,134);
  text('COPA 2025-0001636',73,85,27,color.ink,700);
  text('2025.04.07  /  CHICAGO',74,121,19,color.sub,700);
  const a=fade(t,s.at,s.at+.72);
  g.save();g.globalAlpha=a;
  const x=74+(1-a)*-17;
  line([[x,393],[x+69,393]],amber,4);
  text(s.en,x,443,19,amber,700);
  text(s.title,x,520,s.title.length>12?44:55,color.ink,700);
  text(s.label,x,584,25,color.ink,700);
  text(s.detail,x,632,21,color.sub);
  text(s.state,x,689,18,'#9fb8c7');
  g.restore();
  for(let i=0;i<scenes.length;i++){
    const x=74+i*57,active=scenes[i].at<=t;
    line([[x,991],[x+42,991]],active?'#f5c68f':'#667986',4);
  }
  text('案件过程动画  /  分段叙事',74,1037,19,color.sub);
  if(!['inside','sequence'].includes(s.map))compass();
  credit(mapSource);
}
export function frame(t){
  const s=scenes.find(k=>t>=k.at&&t<k.end)||scenes.at(-1);
  const u=clamp((t-s.at)/(s.end-s.at));
  const px=stage(s,t,u);
  outdoors(s,t,u,px);
  if(['inside','sequence','after'].includes(s.map))indoor(s,t,u);
  editorial(s,t);
}
