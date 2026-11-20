import { chromium } from 'playwright';
import { spawn,execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir,rename,rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { serve } from './server.mjs';

export async function renderVideo({pagePath,setup,frame,count,fps,width,height,output,audio,privateMedia}) {
  const server=await serve('dist',privateMedia);
  let browser,encoder;
  const destination=resolve(output),temporary=destination+'.partial.mp4';
  try{
    await mkdir(dirname(destination),{recursive:true});
    browser=await chromium.launch({executablePath:process.env.CASEMAP_CHROMIUM||undefined,
      args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    page.on('pageerror',error=>console.error('浏览器:',error.message));
    await page.goto(server.url+'/'+pagePath,{waitUntil:'load'});
    const ready=await setup(page);
    console.log('READY',JSON.stringify(ready));
    const input=['-hide_banner','-v','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0'];
    const sound=audio?['-i',audio,'-map','0:v','-map','1:a','-af','apad','-c:a','aac','-b:a','160k']:[];
    encoder=spawn('ffmpeg',[...input,...sound,'-t',String(count/fps),'-c:v','libx264','-threads','4',
      '-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',temporary],{stdio:['pipe','ignore','inherit']});
    encoder.stdin.on('error',()=>{});
    const done=once(encoder,'close').then(([code])=>{if(code!==0)throw Error('FFmpeg 退出代码 '+code);});
    done.catch(()=>{});
    for(let i=0;i<count;i++){
      const data=await frame(page,i/fps);
      if(typeof data!=='string' || data.length<500)throw Error('帧未返回有效图像');
      if(!encoder.stdin.write(Buffer.from(data,'base64')))await Promise.race([once(encoder.stdin,'drain'),done]);
      if(i===0 || (i+1)%60===0 || i===count-1)console.log('FRAME',i+1,count);
    }
    encoder.stdin.end();
    await done;
    const report=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',temporary]));
    const stream=report.streams.find(s=>s.codec_type==='video');
    if(stream?.codec_name!=='h264'||stream.width!==width||stream.height!==height||Number(stream.nb_read_frames)!==count||
      stream.avg_frame_rate!==fps+'/1'||(audio&&!report.streams.some(s=>s.codec_type==='audio'))) throw Error('成片元数据校验未通过');
    await rename(temporary,destination);
    console.log('VERIFIED',destination,width,height,fps,count,'frames');
    return report;
  } finally {
    if(encoder&&encoder.exitCode===null)encoder.kill();
    await browser?.close();
    await server.close();
    await rm(temporary,{force:true});
  }
}
