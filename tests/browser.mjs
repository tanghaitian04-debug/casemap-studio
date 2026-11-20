import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright';
import { serve } from '../scripts/server.mjs';

const server=await serve();
async function checkLayout(page) {
  const box=await page.evaluate(()=>({ width:innerWidth, body:document.documentElement.scrollWidth }));
  assert.ok(box.body<=box.width+1,`页面水平溢出 ${JSON.stringify(box)}`);
}
async function testEditor(browser, mobile) {
  const page=await browser.newPage(mobile ? devices['iPhone 13'] : {viewport:{width:1440,height:900}});
  const failures=[];
  page.on('pageerror',error=>failures.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(()=>document.querySelector('#projectTitle').value.includes('松湾市'));
  await checkLayout(page);
  await page.getByRole('button',{name:'新建',exact:true}).click();
  await page.locator('#projectTitle').fill('手机验收项目');
  await page.locator('#btnAddPerson').click();
  if (mobile) await page.getByRole('button',{name:'属性编辑'}).click();
  await page.locator('#actorName').fill('测试警员');
  if (mobile) await page.getByRole('button',{name:'预览',exact:true}).click();
  await page.locator('[data-tool=key]').click();
  await page.locator('#scrubber').fill('4');
  await page.locator('#preview').click({position:{x:38,y:44}});
  if (mobile) await page.getByRole('button',{name:'属性编辑'}).click();
  assert.equal(await page.locator('#pointList input').count(),2);
  await page.locator('#pointList input').last().fill('4.5');
  await page.locator('#pointList input').last().press('Tab');
  assert.equal(await page.locator('#pointList input').last().inputValue(),'4.5');
  await page.locator('#camZoom').fill('1.5');
  await page.locator('#btnCamera').click();
  assert.equal(await page.locator('#cameraList input').count(),2);
  if (mobile) await page.getByRole('button',{name:'项目与对象'}).click();
  await page.locator('#btnAddCar').click();
  if (mobile) await page.getByRole('button',{name:'预览',exact:true}).click();
  await checkLayout(page);
  await page.locator('#btnPlay').click();
  await page.waitForFunction(()=>document.querySelector('#btnPlay').textContent.includes('暂停'));
  await page.locator('#btnPlay').click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#btnExportJson').click()]);
  const file=await download.path();
  const project=JSON.parse(await readFile(file,'utf8'));
  assert.equal(project.actors.length,2);
  assert.deepEqual(project.actors[0].points.map(p=>p.t),[0,4.5]);
  assert.equal(project.camera.at(-1).zoom,1.5);
  await page.locator('#importFile').setInputFiles(file);
  await page.waitForFunction(()=>document.querySelector('#toast').textContent==='项目已导入');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#projectTitle').value==='手机验收项目');
  await page.locator('#btnRecord').click();
  assert.ok(await page.getByRole('heading',{name:'云端导出 MP4'}).isVisible());
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  assert.deepEqual(failures,[]);
  await page.close();
  console.log(mobile?'WebKit iPhone 模拟流程通过':'Chromium 桌面流程通过');
}
async function touch(page, kind, points, id=41) {
  const canvas=page.locator('#preview');
  await canvas.scrollIntoViewIfNeeded();
  const rect=await canvas.boundingBox();
  for (const [x,y] of points) await canvas.dispatchEvent(kind,{
    pointerId:id,pointerType:'touch',button:0,bubbles:true,
    clientX:rect.x+x*rect.width,clientY:rect.y+y*rect.height
  });
}
async function motionGesture(page,points) {
  await touch(page,'pointerdown',points.slice(0,1));
  await touch(page,'pointermove',points.slice(1));
  await touch(page,'pointerup',points.slice(-1));
}
async function exportProject(page) {
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#btnExportJson').click()]);
  return JSON.parse(await readFile(await download.path(),'utf8'));
}
async function testMotion(browser,mobile) {
  const page=await browser.newPage(mobile?devices['iPhone 13']:{viewport:{width:1440,height:950}});
  const failures=[];
  page.on('pageerror',error=>failures.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(()=>document.querySelector('#projectTitle').value.includes('松湾市'));
  const openAssets=async()=>{if(mobile)await page.getByRole('button',{name:'项目与对象'}).click();};
  await page.locator('#btnReset').click();
  await page.locator('#btnAddCar').click();
  await page.locator('[data-tool=draw]').click();
  await motionGesture(page,[[.5,.5],[.57,.5],[.64,.51],[.70,.56],[.70,.63],[.66,.70],[.59,.70]]);
  await page.locator('#routeDuration').fill('8');
  await page.locator('#routeApply').click();
  let draft=await exportProject(page);
  assert.equal(draft.actors[0].points.at(-1).t,8);
  assert.ok(draft.actors[0].points.length>=4);
  const last=draft.actors[0].points.at(-1);
  assert.ok(Math.abs(last.x-.59)<.005 && Math.abs(last.y-.70)<.005);
  await page.locator('#btnPlay').click();
  await page.waitForFunction(()=>Number(document.querySelector('#scrubber').value)>.3);
  await page.locator('#btnPlay').click();
  await page.locator('#scrubber').fill('0');
  await page.locator('[data-tool=nodes]').click();
  for (const p of [[.63,.52],[.72,.57],[.77,.63]]) await motionGesture(page,[p]);
  await page.locator('#routeApply').click();
  draft=await exportProject(page);
  assert.equal(draft.actors[0].points.length,4);
  await page.locator('#editNodes').click();
  await motionGesture(page,[[.77,.63],[.81,.65]]);
  draft=await exportProject(page);
  assert.ok(Math.abs(draft.actors[0].points.at(-1).x-.81)<.012);
  await page.locator('#undo').click();
  assert.ok(Math.abs((await exportProject(page)).actors[0].points.at(-1).x-.77)<.012);
  await page.locator('#redo').click();
  await openAssets();
  await page.locator('#btnAddPerson').click();
  await page.locator('#autoKey').click();
  await motionGesture(page,[[.5,.5],[.33,.44]]);
  await page.locator('#scrubber').fill('5');
  await motionGesture(page,[[.33,.44],[.42,.36]]);
  await page.locator('#scrubber').fill('10');
  await motionGesture(page,[[.42,.36],[.60,.32]]);
  await motionGesture(page,[[.60,.32],[.61,.33]]);
  let keys=(await exportProject(page)).actors[1].points;
  assert.deepEqual(keys.map(p=>p.t),[0,5,10]);
  assert.ok(Math.abs(keys[1].x-.42)<.014 && Math.abs(keys[2].x-.61)<.014);
  await page.locator('#undo').click();
  assert.ok(Math.abs((await exportProject(page)).actors[1].points.at(-1).x-.60)<.014);
  await page.locator('#redo').click();
  await page.locator('#scrubber').fill('7');
  await page.locator('[data-tool=pan]').click();
  await touch(page,'pointerdown',[[.4,.45]],61);
  await touch(page,'pointerdown',[[.6,.55]],62);
  await touch(page,'pointermove',[[.3,.38]],61);
  await touch(page,'pointermove',[[.75,.62]],62);
  await touch(page,'pointerup',[[.3,.38]],61);
  await touch(page,'pointerup',[[.75,.62]],62);
  await page.locator('#saveView').click();
  draft=await exportProject(page);
  assert.ok(draft.camera.find(p=>p.t===7).zoom>1.5);
  const v1=await readFile('examples/demo.json','utf8');
  await page.locator('#importFile').setInputFiles({name:'v1.json',mimeType:'application/json',buffer:Buffer.from(v1)});
  await page.waitForFunction(()=>document.querySelector('#projectTitle').value.includes('松湾市'));
  await checkLayout(page);
  assert.deepEqual(failures,[]);
  await page.close();
  console.log((mobile?'WebKit iPhone 触控指针':'Chromium 指针')+'：三种路线模式、关键帧、双指构图、撤销与 V1 导入通过');
}
try {
  for (const [type,mobile] of (process.env.CASEMAP_BROWSER_ONLY==='chromium' ? [[chromium,false]] : process.env.CASEMAP_BROWSER_ONLY==='webkit' ? [[webkit,true]] : [[chromium,false],[webkit,true]])) {
    const browser=await type.launch({executablePath:type===chromium ? process.env.CASEMAP_CHROMIUM || undefined : undefined});
    try { await testEditor(browser,mobile); await testMotion(browser,mobile); } finally { await browser.close(); }
  }
} finally { await server.close(); }
