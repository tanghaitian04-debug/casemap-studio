const mode = new URLSearchParams(location.search).get('mode');
const {setup,frame} = await import(mode==='geo' ? '../geo/geo.js' : '../reconstruction/reconstruction.js');
window.ready = (async()=>{
  await Promise.all([document.fonts.load('400 26px Film','芝加哥'),document.fonts.load('700 62px Film','芝加哥')]);
  await setup();
  return true;
})();
window.getFrame=async t=>{
  await window.ready;
  await frame(t);
  return document.querySelector('#out').toDataURL('image/jpeg',.89).split(',')[1];
};
