import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dependencies=process.env.CASEMAP_NODE_MODULES || join(root,'node_modules');
const require=createRequire(import.meta.url);
const {chromium}=require(join(dependencies,'playwright'));
const cesium=join(dependencies,'cesium','Build','Cesium');
const type={'.js':'text/javascript','.html':'text/html','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.css':'text/css'};
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const fromCesium=url.pathname.startsWith('/cesium/');
  const base=fromCesium?cesium:root;
  const path=resolve(base,'.'+(fromCesium?url.pathname.slice(7):url.pathname));
  if(!path.startsWith(base+'/')||!existsSync(path)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':type[extname(path)]||'application/octet-stream'});
  createReadStream(path).pipe(res);
});
const settings={
  geo:{seconds:32,name:'Chicago_Geographic_Location',stills:[2,9,13,17,22,27,31],cover:27.5},
  reconstruction:{seconds:116,name:'Hubbard_Case_2D_Reconstruction',stills:[5,17,28,39,50,65,81,96,111],cover:71}
};
const [mode,flag]=process.argv.slice(2);
if(!settings[mode]) throw Error('Use node scripts/render.mjs geo|reconstruction [--preview]');
const spec=settings[mode];
const fps=30, count=(flag==='--smoke'?2:spec.seconds)*fps;
await mkdir(join(root,'qa'),{recursive:true});
await mkdir(join(root,'renders'),{recursive:true});
server.listen(0,'127.0.0.1');
await once(server,'listening');
let browser,processFF;
let completed=false;
const out=join(root,flag==='--smoke'?'qa':'renders',spec.name+'.mp4');
const temp=out+'.partial.mp4';
try{
  let frame;
  if(mode==='reconstruction'&&process.env.CASEMAP_NATIVE_2D==='1'){
    const {createCanvas,loadImage,GlobalFonts}=require(join(dependencies,'@napi-rs/canvas'));
    const canvas=createCanvas(1920,1080);
    for(const font of ['Regular','Bold']){
      const path='/usr/share/fonts/opentype/noto/NotoSansCJK-'+font+'.ttc';
      if(!GlobalFonts.registerFromPath(path,'Film'))throw Error('Missing font '+path);
    }
    globalThis.document={querySelector:()=>canvas};
    globalThis.readFilmImage=url=>loadImage(join(root,url));
    globalThis.readFilmJSON=async url=>JSON.parse(await readFile(join(root,url),'utf8'));
    const reconstruction=await import('../reconstruction/reconstruction.js');
    await reconstruction.setup();
    frame=async t=>{reconstruction.frame(t);return canvas.encode('jpeg',89);};
  }else{
    browser=await chromium.launch({executablePath:process.env.CASEMAP_CHROMIUM||undefined,args:[
      '--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'
    ]});
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    page.on('pageerror',e=>console.error(e));
    await page.goto('http://127.0.0.1:'+server.address().port+'/scripts/frame.html?mode='+mode);
    await page.waitForFunction(()=>typeof window.getFrame==='function',undefined,{timeout:60000});
    await page.evaluate(()=>window.ready);
    frame=async t=>Buffer.from(await page.evaluate(v=>window.getFrame(v),t),'base64');
  }
  if(flag==='--preview'){
    for(const t of spec.stills) await writeFile(join(root,'qa',mode+'-'+t+'.jpg'),await frame(t));
    await writeFile(join(root,'renders',spec.name+'.jpg'),await frame(spec.cover));
  } else {
    processFF=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','2','-f','image2pipe',
      '-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-threads','3',
      '-preset','veryfast','-crf','19','-profile:v','high','-level','4.1','-pix_fmt','yuv420p',
      '-vf','scale=out_range=tv','-color_range','tv','-colorspace','bt709','-color_trc','bt709','-color_primaries','bt709','-movflags','+faststart',temp],{stdio:['pipe','ignore','inherit']});
    processFF.stdin.on('error',()=>{});
    const closed=once(processFF,'close').then(([status])=>{if(status)throw Error('FFmpeg exit '+status);});
    closed.catch(()=>{});
    for(let i=0;i<count;i++){
      const payload=await frame(i/fps);
      if(payload.length<3000)throw Error('Empty frame '+i);
      if(!processFF.stdin.write(payload))await Promise.race([closed,once(processFF.stdin,'drain')]);
      if(i%300===0)console.log(mode,i,count);
    }
    processFF.stdin.end();await closed;
    const stats=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',temp]));
    const [v]=stats.streams;
    if(stats.streams.length!==1||v.codec_name!=='h264'||v.pix_fmt!=='yuv420p'||v.width!==1920||v.height!==1080||
      v.avg_frame_rate!=='30/1'||Number(v.nb_read_frames)!==count||Number(v.duration)!==count/fps)throw Error('Invalid stream: '+JSON.stringify(v));
    await rename(temp,out);completed=true;
    await writeFile(join(root,'qa',mode+'-ffprobe.json'),JSON.stringify(stats,null,2));
    console.log(out,count,'frames');
  }
}finally{
  if(processFF?.exitCode===null)processFF.kill();
  await browser?.close();server.close();
  if(completed)await rm(temp,{force:true});
}
