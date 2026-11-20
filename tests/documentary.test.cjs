const test=require('node:test'),assert=require('node:assert/strict');
const Film=require('../documentary.js'),Flight=require('../flight.js'),Pack=require('../film-pack.js');
const v1=require('../examples/demo.json'),demo=require('../examples/film-demo.json');

test('Cesium camera presets are continuous at each authored keyframe',()=>{
  const flight=Flight.preset(28.5067,-81.4832,10,'奥兰多');
  Flight.validate(flight,10);
  for(const key of flight.frames){
    const state=Flight.sample(flight.frames,key.t);
    assert.ok(Math.abs(state.height-key.height)<.01);
    assert.ok(Math.abs(state.lon-key.lon)<1e-8);
  }
  assert.ok(Flight.sample(flight.frames,0).height>10_000_000);
  assert.ok(Flight.sample(flight.frames,10).height<500);
});
test('neutral drafts preserve unknown times and separate factual and screen clocks',()=>{
  const p=Film.plan({title:'公开资料',state:'Florida',city:'Orlando',story:'车辆驶离场地。现场后来恢复通行。',
    links:'https://example.gov/report'});
  assert.equal(p.events[0].start_time,null);
  assert.equal(p.events[0].end_time,null);
  assert.equal(p.events[0].verification_status,'unverified');
  assert.equal(p.sources.at(-1).status,'unverified');
  assert.equal(p.scenes[0].type,'GlobeScene');
  assert.match(p.scenes[0].caption,/城市中心示意/);
  assert.equal(Film.at(p,12).local,2);
  assert.match(Film.srt(p),/00:00:10,000/);
});
test('verified events require linked human-reviewed sources',()=>{
  const p=Film.plan({story:'车辆驶离。'});
  p.events[0].verification_status='verified';
  assert.throws(()=>Film.validate(p),/已核实来源/);
  p.sources[0].status='verified';
  assert.doesNotThrow(()=>Film.validate(p));
});
test('mixed-media demo covers the full 78-second sequence and keeps labels',()=>{
  Film.validate(demo);
  const shots=Film.sequence(demo.scenes);
  assert.equal(shots.at(-1).end,78);
  assert.equal(shots.filter(s=>s.type==='FootageScene').length,2);
  assert.equal(Film.at(demo,24).scene.type,'FootageScene');
  assert.equal(Film.at(demo,39).scene.type,'ReconstructionScene');
  assert.equal(Film.at(demo,77).scene.type,'TitleScene');
  assert.equal(demo.fictional,true);
  assert.match(Film.narration(demo),/虚构/);
});
test('V1 migration preserves route keyframes, and ZIP preserves exact user media',async()=>{
  const p=Film.migrate(v1);
  assert.deepEqual(p.scenes[0].map,v1);
  p.assets['source-video']={kind:'video',name:'源片.mp4',rights:true,credit:'测试用素材'};
  const data=new Blob([Uint8Array.from([10,2,83,22])],{type:'video/mp4'});
  const packed=await Pack.pack(p,new Map([['source-video',data]]));
  const out=await Pack.unpack(packed);
  assert.deepEqual(out.project,p);
  assert.deepEqual(new Uint8Array(await out.blobs.get('source-video').arrayBuffer()),Uint8Array.from([10,2,83,22]));
});
test('optional agent never upgrades facts or accepts an invented quote',async()=>{
  const {applyAgent}=await import('../server/film-agent.mjs');
  const story='停车场有车辆。',p=Film.plan({story});
  const row={quote:'停车场有车辆',narration:'资料提到一辆车在停车场。',type:'TitleScene',uncertainty:'距离与时间待核实'};
  const q=applyAgent(p,{segments:[row]},story);
  assert.equal(q.events[0].verification_status,'unverified');
  assert.equal(q.events[0].start_time,null);
  assert.match(q.scenes[1].narration,/用户提供/);
  assert.throws(()=>applyAgent(p,{segments:[{...row,quote:'编造原文'}]},story),/无法对应/);
});
