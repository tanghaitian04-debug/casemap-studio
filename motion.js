/* Deterministic map-space motion shared by the editor and offline renderer. */
(function (root) {
  'use strict';
  const ratio = 16 / 9;
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const distance = (a,b) => Math.hypot((b.x-a.x)*ratio,b.y-a.y);
  const sorted = points => [...points].sort((a,b) => a.t-b.t);
  const easing = {
    linear: u => u, smooth: u => u*u*(3-2*u), in: u => u*u,
    out: u => 1-(1-u)**2, hold: u => Number(u>=1)
  };

  function distanceToSegment(point,a,b) {
    const dx=(b.x-a.x)*ratio, dy=b.y-a.y;
    const u=clamp(((point.x-a.x)*ratio*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
    return distance(point,{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u});
  }
  function simplify(input, tolerance=.003) {
    const points=input.filter((p,i)=>!i || distance(p,input[i-1])>.0003);
    if (points.length<3) return points;
    const keep=new Set([0,points.length-1]), pending=[[0,points.length-1]];
    while (pending.length) {
      const [first,last]=pending.pop();
      let index=-1, max=tolerance;
      for (let i=first+1;i<last;i++) {
        const error=distanceToSegment(points[i],points[first],points[last]);
        if (error>max) { max=error; index=i; }
      }
      if (index>=0) { keep.add(index); pending.push([first,index],[index,last]); }
    }
    return points.filter((_,i)=>keep.has(i));
  }
  function compact(points,tolerance) {
    let result=simplify(points,tolerance);
    while (result.length>100) {
      tolerance*=1.35;
      result=simplify(points,tolerance);
    }
    return result;
  }
  function turn(points,i) {
    const a=points[i-1], b=points[i], c=points[i+1];
    if (!a || !c) return 0;
    const length=distance(a,b)*distance(b,c);
    if (!length) return 0;
    return clamp((1-((b.x-a.x)*(c.x-b.x)*ratio**2+(b.y-a.y)*(c.y-b.y))/length)/2,0,1);
  }
  function schedule(nodes,start,duration,settings) {
    const weights=nodes.slice(1).map((p,i) =>
      Math.max(.00001,distance(nodes[i],p))*(1+(settings.turnSlow||0)*(turn(nodes,i)+turn(nodes,i+1))));
    const total=weights.reduce((a,b)=>a+b,0);
    const power=settings.speed==='in' || settings.speed==='out' ? 2 : 1;
    let sum=0, previous=0;
    return nodes.map((point,i)=>{
      sum+=weights[i-1]||0;
      const u=i===0?0:i===nodes.length-1?1:sum/total;
      const fraction=settings.speed==='out'?1-(1-u)**(1/power):u**(1/power);
      const current=i===0?0:i===nodes.length-1?1:fraction;
      // Convert the selected route-wide speed to a time for each control point.
      previous=Math.max(previous,current);
      return {...point,t:start+previous*duration,ease:'linear'};
    });
  }
  function put(points,time,values,limit=500) {
    const existing=points.find(point=>Math.abs(point.t-time)<.0005);
    if (existing) Object.assign(existing,values);
    else if (points.length<limit) points.push({t:time,...values});
    else return null;
    points.sort((a,b)=>a.t-b.t);
    return existing || points.find(point=>point.t===time);
  }
  function tangent(points,i,amount) {
    const p=points[i], before=points[i-1], after=points[i+1];
    if (!before || !after) return {x:0,y:0};
    const length=distance(before,after);
    const size=Math.min(distance(before,p)*.27,distance(p,after)*.27,.008)*amount*(1-turn(points,i));
    return length ? {x:(after.x-before.x)*size/length,y:(after.y-before.y)*size/length} : {x:0,y:0};
  }
  function prepareRoute(actor) {
    const points=sorted(actor.points);
    const amount=actor.route.curve;
    const handles=points.map((_,i)=>tangent(points,i,amount));
    return {points,amount,handles};
  }
  function routePosition(actor,t,prepared=prepareRoute(actor)) {
    const {points,amount,handles}=prepared;
    const first=points[0], last=points.at(-1);
    if (!first) return {x:0,y:0};
    if (t<=first.t) return {x:first.x,y:first.y};
    if (t>=last.t) return {x:last.x,y:last.y};
    let low=1, high=points.length-1;
    while(low<high) {
      const mid=(low+high)>>1;
      if(points[mid].t<t)low=mid+1;
      else high=mid;
    }
    const a=points[low-1], b=points[low];
    const u=(easing[b.ease]||easing.linear)(clamp((t-a.t)/(b.t-a.t||.001),0,1));
    const v=1-u;
    const c=handles[low-1],d=handles[low];
    const bridge=amount*v*u*(u-v);
    const value=k=>clamp(a[k]*v+b[k]*u+3*v*u*(v*c[k]-u*d[k])+bridge*(b[k]-a[k]),0,1);
    return {x:value('x'),y:value('y')};
  }
  function visible(actor,t) {
    return actor.points.length && t >= (actor.start ?? Math.min(...actor.points.map(p=>p.t))) &&
      t < (actor.end ?? Infinity);
  }
  function heading(actor,t,position,w,h) {
    const window=.025+(actor.route?.steering??.25)*.48;
    const before=position(t-window), after=position(t+window);
    let dx=(after.x-before.x)*w, dy=(after.y-before.y)*h;
    const moving=Math.hypot(dx,dy)>.035;
    if (!moving) {
      const points=sorted(actor.points);
      const segments=points.slice(1).map((p,i)=>({t:p.t,dx:(p.x-points[i].x)*w,dy:(p.y-points[i].y)*h}))
        .filter(s=>Math.hypot(s.dx,s.dy)>.01);
      const nearest=segments.filter(s=>s.t<=t).at(-1)??segments[0];
      dx=nearest?.dx??1; dy=nearest?.dy??0;
    }
    const prior=actor.points.filter(p=>p.t<=t && (p.heading!==undefined || p.motion!==undefined));
    const state=sorted(prior);
    const fixed=state.filter(p=>p.heading!==undefined).at(-1)?.heading ?? actor.heading;
    const motion=state.filter(p=>p.motion!==undefined).at(-1)?.motion ?? actor.motion;
    return {angle:fixed===undefined?Math.atan2(dy,dx):fixed*Math.PI/180,moving,motion};
  }
  const api={distance,compact,schedule,put,prepareRoute,routePosition,visible,heading,sorted};
  if (typeof module==='object') module.exports=api;
  else root.CaseMapMotion=api;
})(globalThis);
