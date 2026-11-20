import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

function verifyFrames(path) {
  const hashes=execFileSync('ffmpeg',['-v','error','-i',path,'-f','framemd5','-'],{encoding:'utf8'})
    .split('\n').filter(line=>/^0,/.test(line)).map(line=>line.split(',').at(-1).trim());
  assert.ok(new Set(hashes).size>=5,'画面内容未随时间变化');
  const frames=execFileSync('ffmpeg',['-v','error','-i',path,'-vf','scale=32:18,format=gray',
    '-pix_fmt','gray','-f','rawvideo','-'],{maxBuffer:4_000_000});
  const pixels=32*18;
  for (let offset=0;offset<frames.length;offset+=pixels) {
    const sample=frames.subarray(offset,offset+pixels);
    const min=Math.min(...sample),max=Math.max(...sample);
    assert.ok(max-min>25,'检测到黑屏或空白帧');
  }
  assert.equal(frames.length/pixels,hashes.length);
}
for (const width of [1280,1920]) {
  const output=`out/verify-${width}.mp4`;
  const args=['scripts/render.mjs','--seconds','1','--width',String(width),'--output',output];
  if (process.env.CASEMAP_TEST_NATIVE==='1') args.push('--native');
  execFileSync(process.execPath,args,{stdio:'inherit'});
  const report=JSON.parse(await readFile(output+'.ffprobe.json','utf8'));
  assert.equal(report.streams[0].codec_name,'h264');
  assert.equal(report.streams[0].width,width);
  assert.equal(report.streams[0].r_frame_rate,'30/1');
  assert.equal(Number(report.streams[0].nb_read_frames),30);
  verifyFrames(output);
  console.log(`${width} 像素宽短片的元数据、黑帧与画面变化检查通过`);
}
for (const path of process.argv.slice(2)) {
  verifyFrames(path);
  console.log(path+' 所有帧通过有效像素检查');
}
