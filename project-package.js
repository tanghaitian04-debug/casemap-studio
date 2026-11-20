(function(root) {
  'use strict';
  const codec=typeof module==='object'?require('fflate'):root.fflate;
  const format=typeof module==='object'?require('./project.js'):root.CaseMapProject;
  const limit=48_000_000;
  const media=/^data:((?:image|audio)\/[a-z0-9-]+);base64,([A-Za-z0-9+/]+={0,2})$/;
  function refs(project) {
    return [[project.map,'image'],
      ...project.actors.filter(a=>a.avatar).map(a=>[a,'avatar']),
      ...(project.audio||[]).map(a=>[a,'source'])];
  }
  async function digest(content) {
    const bytes=new Uint8Array(await root.crypto.subtle.digest('SHA-256',content));
    return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function bytes(b64) {
    return typeof Uint8Array.fromBase64==='function'?Uint8Array.fromBase64(b64):
      Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  }
  function base64(data) {
    if(typeof data.toBase64==='function')return data.toBase64();
    let binary='';
    for(let i=0;i<data.length;i+=16384)binary+=String.fromCharCode(...data.subarray(i,i+16384));
    return btoa(binary);
  }
  async function pack(project) {
    const copy=structuredClone(format.validate(project));
    const files=Object.create(null);
    const manifest=[];
    const seen=new Map();
    let total=0;
    for(const [item,key] of refs(copy)){
      const match=media.exec(item[key]);
      if(!match)continue;
      const [,type,encoded]=match;
      const data=bytes(encoded);
      const hash=await digest(data);
      const name='media/'+hash+'.'+type.split('/')[1];
      if(!seen.has(name)){
        total+=data.length;
        if(total>limit)throw new Error('项目素材超过 48 MB');
        seen.set(name,true);
        manifest.push({name,type,hash});
        files[name]=[data,{level:0}];
      }
      item[key]=name;
    }
    files['project.json']=codec.strToU8(JSON.stringify(copy));
    files['manifest.json']=codec.strToU8(JSON.stringify({version:1,media:manifest}));
    return codec.zipSync(files,{level:3});
  }
  async function unpack(buffer) {
    if(buffer.byteLength>limit+2_000_000)throw new Error('项目包超过大小限制');
    let total=0,count=0,problem='';
    const files=codec.unzipSync(new Uint8Array(buffer),{filter:file=>{
      total+=file.originalSize;
      count++;
      if(total>limit+2_000_000 || count>220 || file.originalSize>16_000_000) {
        problem='项目包解压后超过大小限制';return false;
      }
      if(!/^(manifest\.json|project\.json|media\/[a-f0-9]{64}\.[a-z0-9-]+)$/.test(file.name)){
        problem='项目包含不支持的路径';return false;
      }
      return true;
    }});
    if(problem)throw new Error(problem);
    if(!files['project.json'] || !files['manifest.json'])throw new Error('项目包缺少清单或项目文件');
    const manifest=JSON.parse(codec.strFromU8(files['manifest.json']));
    const project=JSON.parse(codec.strFromU8(files['project.json']));
    if(manifest.version!==1 || !Array.isArray(manifest.media) || !Array.isArray(project?.actors) ||
      (project.audio!==undefined && !Array.isArray(project.audio)) || !project.map)throw new Error('项目包格式无效');
    const contents=new Map();
    for(const {name,type,hash} of manifest.media){
      if(typeof name!=='string' || typeof type!=='string' ||
        !/^(image|audio)\/[a-z0-9-]+$/.test(type) ||
        !/^[a-f0-9]{64}$/.test(hash) || name!=='media/'+hash+'.'+type.split('/')[1] ||
        !Object.hasOwn(files,name) || await digest(files[name])!==hash)
        throw new Error('项目包素材缺失或校验失败');
      contents.set(name,'data:'+type+';base64,'+base64(files[name]));
    }
    for(const [item,key] of refs(project)) {
      if(typeof item[key]!=='string')throw new Error('项目包素材地址无效');
      if(item[key].startsWith('media/')) {
        if(!contents.has(item[key]))throw new Error('缺少素材 '+item[key]);
        item[key]=contents.get(item[key]);
      }
    }
    return format.validate(project);
  }
  const api={pack,unpack};
  if(typeof module==='object')module.exports=api;
  else root.CaseMapPackage=api;
})(globalThis);
