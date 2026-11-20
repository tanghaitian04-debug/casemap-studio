(function(){
  'use strict';
  const canvas=document.getElementById('film-render');
  let renderer;
  window.prepareFilm=async (project,urls)=>{
    renderer=new CaseMapFilmRenderer.FilmRenderer(canvas,document.getElementById('geo-render'),
      (id,asset)=>urls[id]||asset.builtin);
    await renderer.prepare(project);
    return renderer.draw(0);
  };
  window.filmFrame=async t=>{
    await renderer.draw(t);
    return canvas.toDataURL('image/jpeg',.94).split(',')[1];
  };
})();
