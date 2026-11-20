import { parseArgs } from 'node:util';
import { renderVideo } from './browser-video.mjs';
const {values}=parseArgs({options:{smoke:{type:'boolean'},output:{type:'string',default:'output/casemap-v2-geo.mp4'}}});
const width=1920,height=1080,fps=30,count=values.smoke?3:300;
await renderVideo({
  pagePath:'geotest.html',width,height,fps,count,output:values.output,
  setup:page=>page.evaluate(({width,height})=>window.setupGeoTest(width,height),{width,height}),
  frame:(page,t)=>page.evaluate(at=>window.geoTestFrame(at),values.smoke?1+t*130:t)
});
