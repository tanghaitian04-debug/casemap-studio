(function(root) {
  'use strict';
  const statusNames={queued:'等待中',preparing:'准备素材',rendering:'渲染画面',
    encoding:'完成编码',verifying:'验证视频',done:'渲染完成',failed:'渲染失败'};
  function mount(api) {
    const $=id=>document.getElementById(id);
    let session=null,job=null,poll=0,busy=false;
    const display=message=>{$('cloudStatus').textContent=message;};
    function endpoint() {
      const value=$('renderServer').value.trim();
      const url=new URL(value||location.origin);
      const loopback=['localhost','127.0.0.1'].includes(url.hostname);
      if((url.protocol!=='https:' && !loopback)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
        throw new Error('请输入 HTTPS 渲染服务地址，格式为域名加可选端口');
      return url.origin;
    }
    async function request(connection,path,options={}) {
      const response=await fetch(connection.origin+path,{
        ...options,headers:{Authorization:'Bearer '+connection.token,
          ...(options.body?{'Content-Type':'application/json'}:{})},
        cache:'no-store',credentials:'omit',redirect:'error'
      });
      if(!response.ok){
        const detail=await response.json().catch(()=>null);
        throw new Error(detail?.error||'渲染服务返回 HTTP '+response.status);
      }
      return response;
    }
    function options() {
      const width=Number($('renderResolution').value);
      return {size:[width,width*9/16],fps:Number($('renderFps').value)};
    }
    function refresh() {
      $('cloudStart').disabled=!session||busy||Boolean(job&&!job.done);
      $('cloudConnect').disabled=busy||Boolean(job&&!job.done);
      $('cloudVideo').hidden=!job?.done||job.stage!=='done';
      $('btnAiScript').hidden=!session?.ai;
      $('aiConsent').hidden=!session?.ai;
    }
    $('cloudConnect').onclick=async()=>{
      busy=true;refresh();
      try{
        const connection={origin:endpoint(),token:$('renderToken').value.trim()};
        if(connection.token.length<32)throw new Error('请输入渲染服务的访问密钥');
        const response=await request(connection,'/api/capabilities',{signal:AbortSignal.timeout(12000)});
        const capabilities=await response.json();
        if(!capabilities.render)throw new Error('此地址未提供 CaseMap 私有渲染');
        session={...connection,ai:capabilities.ai};
        $('renderToken').value='';
        job=null;
        display('私有渲染服务已连接');
      }catch(error){session=null;job=null;display(error.message);}
      finally{busy=false;refresh();}
    };
    async function checkJob() {
      if(!job || job.done || !session)return;
      try{
        const status=await (await request(session,'/api/jobs/'+job.id,{signal:AbortSignal.timeout(15000)})).json();
        job.stage=status.stage;
        const frames=status.stage==='rendering' && Number.isFinite(status.total)?' · '+status.frames+'/'+status.total+' 帧':'';
        display((statusNames[status.stage]||'等待状态更新')+frames+(status.error?' · '+status.error:''));
        if(['done','failed'].includes(status.stage)){
          job.done=true;refresh();return;
        }
      }catch(error){
        display('状态暂时无法读取 · '+error.message);
      }
      poll=setTimeout(checkJob,1400);
    }
    $('cloudStart').onclick=async()=>{
      if(!session||busy)return;
      busy=true;clearTimeout(poll);job=null;refresh();display('正在向已连接的私有服务传输项目…');
      try {
        const project={...api.project(),...options()};
        await api.ready();
        root.CaseMapProject.validate(project);
        const response=await request(session,'/api/jobs',{
          method:'POST',body:JSON.stringify({project}),signal:AbortSignal.timeout(90000)
        });
        const data=await response.json();
        const name=$('outputName').value.trim().replace(/[\\/:*?"<>|]/g,'-').replace(/\.mp4$/i,'')||'case-map';
        job={id:data.id,stage:'queued',name:name+'.mp4',done:false};
        display('等待中');void checkJob();
      }catch(error){display('提交失败 · '+error.message);}
      finally{busy=false;refresh();}
    };
    $('cloudVideo').onclick=async()=>{
      if(job?.stage!=='done'||!session)return;
      try{
        const response=await request(session,'/api/jobs/'+job.id+'/video',{signal:AbortSignal.timeout(90000)});
        api.download(await response.blob(),job.name);
      }catch(error){display('下载失败 · '+error.message);}
    };
    $('btnAiScript').onclick=async()=>{
      if(!session?.ai)return;
      if(!$('allowAi').checked){api.toast('请确认允许将输入的描述发送给 AI 服务');return;}
      const before=api.project(),button=$('btnAiScript');
      button.disabled=true;
      try{
        const response=await request(session,'/api/parse',{method:'POST',
          body:JSON.stringify({brief:$('brief').value}),signal:AbortSignal.timeout(55000)});
        const result=await response.json();
        if(api.project()!==before)return;
        const project=root.CaseMapProject.validate({...result.project,map:before.map});
        api.useProject(project);
        api.toast('AI 草稿已生成 · 路线和时间待核实');
      } catch(error){api.toast(error.message);}
      finally{button.disabled=false;}
    };
    refresh();
    return {open(){
      const project=api.project();
      $('renderResolution').value=project.size[0];
      $('renderFps').value=[24,30,60].includes(project.fps)?project.fps:30;
      refresh();
      $('exportDialog').showModal();
    },options};
  }
  root.CaseMapCloud={mount};
})(globalThis);
