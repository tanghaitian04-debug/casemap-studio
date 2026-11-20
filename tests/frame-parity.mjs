import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from '../scripts/server.mjs';
const server=await serve();
const browser=await chromium.launch({executablePath:process.env.CASEMAP_CHROMIUM||undefined});
try {
  const project=JSON.parse(await readFile('examples/demo.json','utf8'));
  const editor=await browser.newPage(), render=await browser.newPage();
  await editor.goto(server.url);
  await editor.waitForFunction(()=>document.querySelector('#projectTitle').value.includes('松湾市'));
  await render.goto(server.url+'/render.html');
  await render.evaluate(scene=>window.prepareScene(scene),project);
  // Verify the introductory globe, the transfer to the map, the pursuit,
  // the visual effect, and the ending all use identical renderer frames.
  const samples=[31,129,150,330,450,602,756,820,896];
  for(const index of samples){
    await editor.locator('#scrubber').evaluate((input,seconds)=>{input.value=String(seconds);input.dispatchEvent(new Event('input',{bubbles:true}));},index/30);
    const expected=await render.evaluate(i=>window.renderFrames(i,1,30)[0],index);
    await editor.waitForFunction(known=>document.querySelector('#preview').toDataURL('image/jpeg',.96).endsWith(known),expected,{timeout:6000});
  }
  assert.equal(samples.length,9);
  console.log('9 个时间点的浏览器预览和离线渲染 JPEG 逐字节一致');
} finally {
  await browser.close();
  await server.close();
}
