(function(root){
  'use strict';
  const zip=typeof module==='object'?require('fflate'):root.fflate;
  const Film=typeof module==='object'?require('./documentary.js'):root.CaseMapDocumentary;
  const limit=110_000_000;
  const mimes={video:'video/mp4',audio:'audio/mpeg',image:'image/jpeg'};
  async function pack(project,blobs) {
    Film.validate(project);
    const entries={'film.json':zip.strToU8(JSON.stringify(project))};
    let total=entries['film.json'].length;
    for(const [id,asset] of Object.entries(project.assets)){
      if(asset.builtin)continue;
      const data=blobs.get(id);
      if(!data)throw Error('缺少素材：'+asset.name);
      total+=data.size;
      if(total>limit)throw Error('影片项目包不能超过 110 MB');
      entries['media/'+id]=[new Uint8Array(await data.arrayBuffer()),{level:0}];
    }
    return zip.zipSync(entries,{level:2});
  }
  async function unpack(data) {
    if(data.byteLength>limit)throw Error('影片项目包不能超过 110 MB');
    let size=0,count=0,error;
    const files=zip.unzipSync(new Uint8Array(data),{filter:info=>{
      size+=info.originalSize;count++;
      if(size>limit||count>33||!/^(film\.json|media\/[a-z0-9_-]{1,50})$/.test(info.name)){
        error=Error('影片项目包路径、大小或素材数量无效');return false;
      }
      return true;
    }});
    if(error)throw error;
    if(!files['film.json'])throw Error('项目包缺少 film.json');
    const project=Film.validate(JSON.parse(zip.strFromU8(files['film.json'])));
    const blobs=new Map();
    for(const [id,item] of Object.entries(project.assets)){
      if(item.builtin)continue;
      if(!Object.hasOwn(files,'media/'+id))throw Error('项目包缺少素材：'+item.name);
      const type=item.type&&/^(video|audio|image)\/[a-z0-9.+-]+$/i.test(item.type)?item.type:mimes[item.kind];
      blobs.set(id,new Blob([files['media/'+id]],{type}));
    }
    return {project,blobs};
  }
  const api={pack,unpack};
  if(typeof module==='object')module.exports=api;
  else root.CaseMapFilmPack=api;
})(globalThis);
