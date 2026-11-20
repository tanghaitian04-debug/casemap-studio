import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium,webkit,devices } from 'playwright';
import { serve } from '../scripts/server.mjs';
const server=await serve();
const both=process.env.CASEMAP_BROWSER_ONLY==='chromium'?[[chromium,false]]:[[chromium,false],[webkit,true]];
try{
  for(const [driver,phone] of both){
    const browser=await driver.launch({executablePath:driver===chromium?process.env.CASEMAP_CHROMIUM||undefined:undefined});
    try {
      const page=await browser.newPage(phone?devices['iPhone 13']:{viewport:{width:1320,height:960}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(server.url+'/documentary.html');
      await page.locator('#title').fill('试拍案例');
      await page.locator('#story').fill('一辆车驶离停车场。随后车辆停止。');
      await page.locator('#links').fill('https://example.gov/source');
      await page.locator('#generate').click();
      await page.locator('#shots details').last().waitFor({state:'visible'});
      assert.equal(await page.locator('#shots details').count(),4);
      assert.equal(await page.locator('#events details').count(),2);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const [pack]=await Promise.all([page.waitForEvent('download'),page.locator('#save-project').click()]);
      await page.locator('#import').setInputFiles({name:'film.zip',mimeType:'application/zip',buffer:await readFile(await pack.path())});
      await page.getByText('影片项目已导入',{exact:true}).waitFor();
      await page.locator('#play').click();
      await page.getByRole('button',{name:'暂停',exact:true}).waitFor();
      await page.locator('#play').click();
      await page.locator('#import').setInputFiles({name:'v1.json',mimeType:'application/json',buffer:await readFile('examples/demo.json')});
      await page.getByRole('button',{name:'用地图编辑器修改路径',exact:true}).waitFor();
      if(!phone){
        const [editor]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'用地图编辑器修改路径'}).click()]);
        await editor.getByRole('button',{name:'保存回影片',exact:true}).waitFor();
        await editor.waitForFunction(()=>document.querySelector('#projectTitle').value.includes('松湾市'));
        await editor.getByRole('button',{name:'保存回影片',exact:true}).click();
        await page.getByText('地图片段已保存回分镜。',{exact:true}).waitFor();
        await editor.close();
      }
      const [srt]=await Promise.all([page.waitForEvent('download'),page.locator('#save-srt').click()]);
      assert.ok((await readFile(await srt.path(),'utf8')).length>0);
      assert.deepEqual(errors,[]);
      console.log(phone?'WebKit iPhone：V2 分镜、ZIP、播放、V1 导入通过':'Chromium：V2 分镜、ZIP、影片与地图编辑器往返通过');
    }finally{await browser.close();}
  }
}finally{await server.close();}
