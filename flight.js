(function(root){
  'use strict';
  const mix=(a,b,u)=>a+(b-a)*u;
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const radians=x=>x*Math.PI/180;
  const ease={linear:u=>u,smooth:u=>u*u*(3-2*u),in:u=>u*u,out:u=>1-(1-u)**2};
  function sample(frames,t) {
    if(t<=frames[0].t)return frames[0];
    const i=frames.findIndex(f=>f.t>=t);
    if(i<0)return frames.at(-1);
    const a=frames[i-1], b=frames[i], u=(ease[b.ease]||ease.smooth)(clamp((t-a.t)/(b.t-a.t),0,1));
    const angle=(p,q)=>p+(((q-p+540)%360)-180)*u;
    return {t,lat:mix(a.lat,b.lat,u),lon:angle(a.lon,b.lon),
      height:Math.exp(mix(Math.log(a.height),Math.log(b.height),u)),
      heading:angle(a.heading,b.heading),pitch:mix(a.pitch,b.pitch,u)};
  }
  function preset(lat,lon,duration,label,style='arrival') {
    const key=(u,latitude,longitude,height,heading,pitch,ease='linear')=>
      ({t:u*duration,lat:clamp(latitude,-89.9,89.9),lon:longitude,height,heading,pitch,ease});
    const frames=style==='orbit'||style==='pullback' ? [
      key(0,lat-.0013,lon-.0012,200,40,-60),
      key(.42,lat-.0015,lon+.0014,260,-38,-61,'smooth'),
      key(1,lat+.0009,lon+.0008,style==='pullback'?1400:310,235,-78,'out')
    ] : [
      key(0,lat-11,lon-41,16600000,3,-90),key(.20,lat-4,lon-15,5200000,0,-90,'out'),
      key(.44,lat-.20,lon-1.28,630000,5,-90),
      key(.63,lat-.048,lon+.09,28800,-5,-89),
      key(.81,lat-.006,lon+.005,1470,-2,-80),
      key(1,lat,lon,350,0,-90,'out')
    ];
    return {lat,lon,label,frames};
  }
  function validate(f,duration) {
    if(!f||!Number.isFinite(f.lat)||Math.abs(f.lat)>85||!Number.isFinite(f.lon)||Math.abs(f.lon)>180||
      typeof f.label!=='string'||f.label.length>140||!Array.isArray(f.frames)||f.frames.length<2||f.frames.length>50)
      throw Error('地理镜头需要经纬度及两个以上关键帧');
    let time=-1;
    for(const k of f.frames){
      if(![k.t,k.lat,k.lon,k.height,k.heading,k.pitch].every(Number.isFinite)||k.t<=time||k.t<0||
        k.t>duration+.0001||Math.abs(k.lat)>89.9||Math.abs(k.lon)>240||k.height<30||k.height>40000000||
        Math.abs(k.heading)>720||k.pitch< -90||k.pitch> -12||!Object.hasOwn(ease,k.ease))
        throw Error('地理镜头关键帧超出范围或时间未排序');
      time=k.t;
    }
    return f;
  }
  const api={sample,preset,validate,radians};
  if(typeof module==='object')module.exports=api;
  else root.CaseMapFlight=api;
})(globalThis);
