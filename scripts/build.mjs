import { cp, mkdir, rm } from 'node:fs/promises';

const files = ['index.html','styles.css','app.js','engine.js','geo.js','motion.js','motion-editor.js','draft-store.js','project-package.js','cloud-client.js','project.js','script.js','render.html',
  'flight.js','geo-scene.js','geotest.html','geo-test.js','assets/geo','documentary.html','documentary.css','documentary-ui.js','film-render.html','offline-film.js','documentary.js','film-pack.js','film-renderer.js','examples/film-demo.json','assets/simulation.mp4','examples/demo.json','assets/earth.webp','assets/demo-map.webp','assets/NOTICE.md'];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for (const file of files) await cp(file, 'dist/' + file,{recursive:true});
await cp('node_modules/fflate/umd/index.js','dist/fflate.js');
await cp('node_modules/cesium/Build/Cesium','dist/cesium',{recursive:true});
console.log('CaseMap Studio static build created with ' + files.length + ' files.');
