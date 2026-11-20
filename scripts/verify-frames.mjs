import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function verifyFrames(path, requireMotion=true) {
  const frames=execFileSync('ffmpeg',['-v','error','-i',path,'-vf','scale=32:18,format=gray',
    '-pix_fmt','gray','-f','rawvideo','-'],{maxBuffer:7_000_000});
  const pixels=32*18;
  assert.ok(frames.length>0 && frames.length%pixels===0,'没有可解码的完整画面');
  let first, changed=0;
  for (let offset=0;offset<frames.length;offset+=pixels) {
    const sample=frames.subarray(offset,offset+pixels);
    const min=Math.min(...sample),max=Math.max(...sample);
    assert.ok(max-min>25,'检测到黑屏或空白帧');
    if(!first)first=sample;
    else if(!sample.equals(first))changed++;
  }
  if(requireMotion)assert.ok(changed>=5,'画面内容未随时间变化');
  return frames.length/pixels;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  for(const path of process.argv.slice(2))console.log(path+' · '+verifyFrames(path,false)+' 帧通过画面检查');
}
