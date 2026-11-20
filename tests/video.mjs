import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import {verifyFrames} from '../scripts/verify-frames.mjs';
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
