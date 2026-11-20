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
  await page.locator('#actorName').fill('测试警员');
  if (mobile) await page.getByRole('button',{name:'预览',exact:true}).click();
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
try {
  for (const [type,mobile] of (process.env.CASEMAP_BROWSER_ONLY==='chromium' ? [[chromium,false]] : [[chromium,false],[webkit,true]])) {
    const browser=await type.launch({executablePath:type===chromium ? process.env.CASEMAP_CHROMIUM || undefined : undefined});
    try { await testEditor(browser,mobile); } finally { await browser.close(); }
  }
} finally { await server.close(); }
