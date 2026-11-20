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
