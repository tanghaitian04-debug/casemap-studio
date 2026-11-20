import { readFile,writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), Film=require('../documentary.js'),Flight=require('../flight.js');
const map=JSON.parse(await readFile('examples/demo.json','utf8'));
map.events=map.events.filter(e=>e.type!=='gunfire');
map.captions=[];
map.subtitle='松湾市虚构示意 · 非真实执法画面';
const base=Film.plan({
  title:'松湾市停车场交通事件',country:'美国（示意）',
  story:'巡查人员到达停车场。车辆驶离公共停车区，两车先后通过弯道。最后车辆停止，巡查人员在停车区外停下。'
});
base.fictional=true;base.reviewed=true;
base.sources[0].title='原创虚构案例文字设定';
base.sources[0].status='illustrative';
base.sources.push({id:'geo-demo',title:'USDA NAIP 公共航拍 · 奥兰多地理演示',notes:'与松湾市虚构情节无关。地球为 NASA Earth Observatory Blue Marble。',
  published:'',occurred:'',url:'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer',status:'verified'});
base.sources.push({id:'sim-footage',title:'原创模拟录像',notes:'从 CaseMap Studio 自制地图与对象生成的示意机位。',published:'',occurred:'',url:'',status:'illustrative'});
base.assets={
  simulation:{kind:'video',name:'原创建模模拟机位',rights:true,credit:'CaseMap Studio 原创模拟素材',builtin:'assets/simulation.mp4'},
  'public-park':{kind:'image',name:'奥兰多公园航拍',rights:true,credit:'USDA NAIP / USGS The National Map',builtin:'assets/geo/orlando-park.webp'}
};
base.events.forEach(e=>{e.verification_status='illustrative';e.confidence=0;e.location='松湾市 · 虚构地点';});
const card=(id,title,duration,caption,narration)=>({...Film.titleScene(id,title,duration),caption,narration});
const event=(n,evidence=['brief'])=>({event:base.events[n].event_id,evidence});
const clip=(id,title,duration,input,caption,narration,n)=>({...card(id,title,duration,caption,narration),
  ...event(n,['brief','sim-footage']),type:'FootageScene',asset:'simulation',in:input,x:0,y:0,zoom:1.04,transition:'cut'});
base.scenes=[
  card('intro','松湾市停车场交通事件',4,'虚构案例 · 制作流程演示','今天用一个虚构案例说明，停车场内的行动如何通过影像和地图相互补充。'),
  {...card('location','佛罗里达州 · 奥兰多',10,'公开地理演示 · 与虚构案件无关','这段使用佛罗里达州奥兰多的公开航拍验证地理飞行。后续松湾市情节为虚构。'),
   type:'GlobeScene',flight:Flight.preset(28.5067,-81.4832,10,'奥兰多 · Bill Frederick Park'),evidence:['geo-demo'],transition:'cut'},
  {...card('image','公共场所航拍资料',7,'公开航拍 · 本地点与剧情无关','将街区全景放在叙事开头，观众能够先看明白道路和场地的大致分布。'),
   type:'ImageScene',asset:'public-park',in:0,x:0,y:0,zoom:1.2,evidence:['geo-demo']},
  {...clip('footage-a','模拟录像 · 停车区机位',10,0,'巡查人员出现在停车区 · 模拟录像','此处用模拟机位展示人员进入停车区，右侧车辆随后移动。',0),arrow:{x:.54,y:.62}},
  {...card('map-a','俯视图 · 车辆驶离',12,'停车区出口及两车相对位置 · 示意','俯视角度能够解释两辆车的位置。此处的线条、时间与方向来自虚构场景设定。'),
    ...event(1),type:'ReconstructionScene',map,in:9,transition:'cut'},
  {...clip('footage-b','模拟录像 · 第二段',11,9,'车辆先后通过弯道 · 模拟录像','镜头回到模拟录像。随着两辆车驶离停车区，画面中的位置关系发生变化。',1),
    mask:{x:.05,y:.04,w:.9,h:.91},gain:.45},
  {...card('map-b','俯视图 · 位置汇总',14,'车辆停止 · 停车区外的位置关系示意','回到俯视图可以交代两辆车最后的相对位置。车辆的路线和镜头时间只用于演示剪辑流程。'),
    ...event(2),type:'MapScene',map,in:17,transition:'cut'},
  card('closing','资料与示意范围',10,'模拟录像、路径和案件经过均为原创虚构','完整影片交替使用地理镜头、模拟录像和二维解释图。真实案件应按照可以查证的资料完成审核。')
];
await writeFile('examples/film-demo.json',JSON.stringify(Film.validate(base),null,2)+'\n');
