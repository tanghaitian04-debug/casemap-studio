const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../project.js');
const script = require('../script.js');
const demo = require('../examples/demo.json');
require('../engine.js');
const { Engine, interp } = globalThis.CaseMapEngine;

test('V1 demo and minimal authoring project validate',()=>{
  assert.equal(format.validate(demo),demo);
  assert.equal(format.validate(format.empty()).version,1);
});
test('invalid media, actor references and camera bounds are rejected',()=>{
  for (const patch of [
    { map:{image:'https://example.net/test.jpg',credit:'example'} },
    { events:[{t:8,type:'alert',actor:'missing'}] },
    { camera:[{t:8,x:.5,y:.5,zoom:0,rotation:0}] },
    { fps:29.5 }
  ]) assert.throws(()=>format.validate({...demo,...patch}),/项目字段无效/);
});
test('project preserves embedded assets and recovers from damaged drafts',()=>{
  const bag=new Map();
  const storage={getItem:id=>bag.get(id),setItem:(id,value)=>bag.set(id,value)};
  const input=format.empty();
  input.map.image='data:image/png;base64,AA==';
  assert.equal(format.restore(storage),null);
  format.save(storage,input);
  assert.deepEqual(format.restore(storage),input);
  storage.setItem('casemap-draft-v1','invalid json');
  assert.equal(format.restore(storage),null);
});
test('keyframes interpolate by absolute time with editable easing',()=>{
  const points=[{t:10,x:1,ease:'smooth'},{t:2,x:0}];
  assert.deepEqual(interp(points,0,['x']),{x:0});
  assert.deepEqual(interp(points,4,['x']),{x:.15625});
  assert.deepEqual(interp(points,10,['x']),{x:1});
  assert.deepEqual(interp(points,60,['x']),{x:1});
  points[0].ease='hold';
  assert.deepEqual(interp(points,9.99,['x']),{x:0});
});
test('actor motion, chase camera, and tilted canvas coordinates round-trip',()=>{
  const engine=Object.create(Engine.prototype);
  engine.project=structuredClone(demo);
  engine.canvas={width:1280,height:720};
  engine.project.camera.find(c=>c.target==='sedan').tilt=24;
  const car=engine.project.actors.find(a=>a.id==='sedan');
  assert.equal(engine.actorPosition(car,13).x,.44);
  assert.notEqual(engine.actorPosition(car,21.9).x,.44);
  const p=engine.actorPosition(car,18.5);
  assert.equal(engine.camera(18.5).x,p.x);
  const screen=engine.worldToScreen(.38,.72,18.5);
  const world=engine.screenToWorld(...screen,18.5);
  assert.ok(Math.abs(world[0]-.38)<1e-9 && Math.abs(world[1]-.72)<1e-9);
});
test('timeline seeks independently of prior playback and toggles camera effects by time',()=>{
  const engine=Object.create(Engine.prototype);
  engine.project=structuredClone(demo);
  const first=engine.camera(27.17);
  engine.camera(0);
  assert.deepEqual(engine.camera(27.17),first);
  engine.project.events.find(e=>e.type==='shake').enabled=false;
  assert.notDeepEqual(engine.camera(27.17),first);
});
test('rule parser preserves order and labels inferred paths',()=>{
  const p=script.parse('警员接近停车场车辆，车辆突然驶离，警车随后追逐，涉事车辆停止。',format);
  assert.deepEqual(p.actors.map(a=>a.kind),['officer','car','car']);
  assert.deepEqual(p.captions.map(c=>c.text),['示意 · 人员接近车辆','示意 · 车辆驶离','示意 · 车辆追逐','示意 · 车辆停止']);
  assert.match(p.subtitle,/示意/);
  assert.throws(()=>script.parse(' ',format));
});

const Motion=require('../motion.js');
test('traced route simplifies jitter, preserves turns and ends after eight seconds',()=>{
  const path=[{x:.2,y:.2},{x:.24,y:.2002},{x:.4,y:.2},{x:.43,y:.34},{x:.52,y:.34}];
  const nodes=Motion.compact(path,.004);
  assert.equal(nodes.length,4);
  const route={curve:.65,steering:.4,turnSlow:.6,speed:'linear'};
  const points=Motion.schedule(nodes,2,8,route);
  assert.equal(points[0].t,2);
  assert.equal(points.at(-1).t,10);
  const actor={points,route};
  for(const {t,x,y} of points)assert.deepEqual(Motion.routePosition(actor,t),{x,y});
  const pos=at=>Motion.routePosition(actor,at);
  const sample=points[1].t;
  const before=Motion.heading(actor,sample-.025,pos,1280,720);
  const after=Motion.heading(actor,sample+.025,pos,1280,720);
  assert.ok(Math.abs(before.angle-after.angle)<.4);
  const changed=points[2];
  const t=changed.t;
  changed.x=.49;
  assert.equal(pos(t).x,.49);
  const retimed=Motion.schedule(nodes,2,12,{...route,speed:'in'});
  assert.equal(retimed.at(-1).t,14);
  assert.ok(retimed[1].t>2+(points[1].t-2)*1.5);
});
test('absolute-time keyframes update matching frame time without duplicates',()=>{
  const points=[];
  Motion.put(points,0,{x:.1,y:.2});
  Motion.put(points,5,{x:.4,y:.4,ease:'linear'});
  Motion.put(points,10,{x:.9,y:.6,ease:'linear'});
  Motion.put(points,5,{x:.5,y:.4});
  assert.deepEqual(points.map(p=>p.t),[0,5,10]);
  const engine=Object.create(Engine.prototype);
  assert.equal(engine.actorPosition({points},5).x,.5);
  assert.equal(engine.actorPosition({points},10).x,.9);
  assert.ok(Math.abs(engine.actorPosition({points},7).x-.66)<1e-9);
});

const Geo=require('../geo.js');
test('georeferencing round-trips Web Mercator and measures in real units',()=>{
  const bounds={west:-88.1,east:-87.1,south:41.4,north:42.4,projection:'mercator'};
  assert.equal(Geo.valid(bounds),true);
  assert.equal(Geo.valid({...bounds,north:90}),false);
  const point=Geo.location(bounds,.34,.75);
  const pixel=Geo.pixel(bounds,point.lat,point.lon);
  assert.ok(Math.abs(pixel.x-.34)<1e-8 && Math.abs(pixel.y-.75)<1e-8);
  assert.ok(Math.abs(Geo.distance({lat:0,lon:0},{lat:0,lon:1})-111195)<10);
  assert.deepEqual(Geo.findCity('Illinois','Chicago'),['Illinois','Chicago',41.8781,-87.6298]);
  const project=format.empty();
  assert.throws(()=>format.validate({...project,map:{...project.map,bounds}}),/地理配准/);
  assert.doesNotThrow(()=>format.validate({...project,map:{credit:'Example',image:'data:image/png;base64,AA==',bounds}}));
});
