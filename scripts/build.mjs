import { cp, mkdir, rm } from 'node:fs/promises';

const files = ['index.html','styles.css','app.js','engine.js','project.js','script.js','render.html',
  'examples/demo.json','assets/earth.webp','assets/demo-map.webp','assets/NOTICE.md'];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for (const file of files) await cp(file, 'dist/' + file);
console.log('CaseMap Studio static build created with ' + files.length + ' files.');
