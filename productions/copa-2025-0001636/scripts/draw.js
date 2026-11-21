export const W=1920,H=1080;
export const canvas=document.querySelector('#out');
export const g=canvas.getContext('2d',{alpha:false});
export const color={ink:'#eef5f7',sub:'#bdced5',amber:'#f8c783',cyan:'#83dbed',red:'#ff6558',dark:'#0a141c'};
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export const mix=(a,b,q)=>a+(b-a)*q;
export const smooth=x=>{const s=clamp(x);return s*s*(3-2*s);};
export const fade=(t,a,b)=>smooth((t-a)/(b-a));
export function line(points,stroke,width=2,dash=[]){
  g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=stroke;
  g.lineCap='round';g.lineJoin='round';g.lineWidth=width;g.setLineDash(dash);g.stroke();g.setLineDash([]);
}
export function text(s,x,y,size=26,fill=color.ink,weight=400,align='left'){
  g.font=weight+' '+size+'px Film, sans-serif';g.fillStyle=fill;g.textAlign=align;g.textBaseline='alphabetic';g.fillText(s,x,y);
}
export function rect(x,y,w,h,fill,stroke,r=0){
  g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();
  if(stroke){g.lineWidth=1.5;g.strokeStyle=stroke;g.stroke();}
}
export function circ(x,y,r,fill,stroke,lw=2){
  g.beginPath();g.arc(x,y,r,0,Math.PI*2);
  if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.lineWidth=lw;g.strokeStyle=stroke;g.stroke();}
}
export function arrow(x,y,x2,y2,fill,dash=[],width=3,size=16){
  const a=Math.atan2(y2-y,x2-x);line([[x,y],[x2,y2]],fill,width,dash);
  g.beginPath();g.moveTo(x2,y2);g.lineTo(x2-size*Math.cos(a-.53),y2-size*Math.sin(a-.53));g.lineTo(x2-size*Math.cos(a+.53),y2-size*Math.sin(a+.53));g.closePath();g.fillStyle=fill;g.fill();
}
export function compass(x=1810,y=103){
  circ(x,y,32,'#0b1720cc','#ecf6fa66');
  arrow(x,y+14,x,y-15,color.ink,[],2,10);text('N',x,y+55,20,color.ink,700,'center');
}
export function image(url){
  if(globalThis.readFilmImage)return globalThis.readFilmImage(url);
  const a=new Image();a.src=url;return a.decode().then(()=>a);
}
export async function json(url){
  if(globalThis.readFilmJSON)return globalThis.readFilmJSON(url);
  const res=await fetch(url);if(!res.ok)throw Error('Missing '+url);return res.json();
}
export function gradient(x1,y1,x2,y2,stops){
  const f=g.createLinearGradient(x1,y1,x2,y2);stops.forEach(([p,c])=>f.addColorStop(p,c));return f;
}
export function credit(s){
  g.font='400 18px Film';const width=g.measureText(s).width+34;
  rect(W-57-width,1022,width,35,'#0a141cbb',null,3);
  text(s,W-73,1048,18,'#d6e3e8',400,'right');
}
