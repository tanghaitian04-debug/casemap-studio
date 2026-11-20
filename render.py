#!/usr/bin/env python3
"""CaseMap Studio: render a case storyboard to MP4 using Pillow/OpenCV/FFmpeg.

All map and portrait assets are supplied by the user or are synthetic demo assets.
"""
from __future__ import annotations
import argparse, base64, io, json, math, os, shutil, subprocess, sys
from functools import lru_cache
from pathlib import Path
from typing import Any
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT_PATHS = [
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]

@lru_cache(maxsize=24)
def font(size: int):
    for path in FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, max(10, int(size)))
    return ImageFont.load_default()


def clamp(v, lo, hi): return max(lo, min(hi, v))
def lerp(a,b,u): return a+(b-a)*u

def rgba(hexcode: str, fallback=(239,84,91)):
    try:
        s=hexcode.lstrip('#')
        if len(s)==3:s=''.join(c*2 for c in s)
        return tuple(int(s[i:i+2],16) for i in (0,2,4))
    except Exception:return fallback


def interpolate(points: list[dict], t: float, keys=('x','y')):
    if not points: return {k:0 for k in keys}
    pts=sorted(points,key=lambda p:float(p.get('t',0)))
    if t<=float(pts[0]['t']):return {k:float(pts[0].get(k,0)) for k in keys}
    for a,b in zip(pts,pts[1:]):
        if t<=float(b['t']):
            delta=float(b['t'])-float(a['t'])
            u=clamp((t-float(a['t']))/delta,0,1) if delta>0 else 1
            return {k:lerp(float(a.get(k,0)),float(b.get(k,0)),u) for k in keys}
    return {k:float(pts[-1].get(k,0)) for k in keys}


def validate(project: dict):
    if project.get('version')!=1: raise ValueError('Unsupported project version (expected 1)')
    w,h=project.get('size',[1280,720]);duration=float(project.get('duration',0));fps=int(project.get('fps',30))
    if not(320<=int(w)<=3840 and 240<=int(h)<=2160):raise ValueError('size out of bounds')
    if not(0.1<=duration<=180):raise ValueError('duration must be 0.1..180 seconds')
    if not(1<=fps<=60):raise ValueError('fps must be 1..60')
    if not isinstance(project.get('actors',[]),list) or len(project.get('actors',[]))>80:raise ValueError('invalid actors')
    ids=set()
    for actor in project.get('actors',[]):
        ident=actor.get('id')
        if not isinstance(ident,str) or not ident or ident in ids:raise ValueError('duplicate/invalid actor id')
        ids.add(ident)
        pts=actor.get('points',[])
        if not isinstance(pts,list) or len(pts)>200:raise ValueError('invalid actor points')
        for p in pts:
            if not (0<=float(p['x'])<=1 and 0<=float(p['y'])<=1 and 0<=float(p['t'])<=duration):
                raise ValueError('actor point outside project bounds')
    return int(w),int(h),fps,duration


def asset_image(ref: str, basedir: Path, fallback=None):
    if not ref:return fallback
    if ref.startswith('data:image/'):
        try:
            data=base64.b64decode(ref.split(',',1)[1],validate=True)
            if len(data)>16_000_000:raise ValueError('embedded image too large')
            return Image.open(io.BytesIO(data)).convert('RGB')
        except Exception:return fallback
    if ref.startswith(('http:','https:','file:')):raise ValueError('Remote URLs are not supported. Download images locally first.')
    path=(basedir/ref).resolve()
    if not path.is_relative_to(basedir.resolve()) and not path.is_relative_to(ROOT.resolve()):
        raise ValueError('Image path must remain inside project or app directory')
    if not path.exists():
        path=(ROOT/ref).resolve()
    if not path.exists():return fallback
    return Image.open(path).convert('RGB')


def make_stars(w,h):
    rng=np.random.default_rng(19)
    bg=np.zeros((h,w,3),dtype=np.uint8)
    bg[:]=[19,15,8] # BGR navy
    yy,xx=np.mgrid[:h,:w]
    haze=np.maximum(0,1-np.hypot((xx-w*.48)/(w*.8),(yy-h*.50)/(h*.8)))
    bg[:,:,0]=np.clip(bg[:,:,0]+haze*26,0,255)
    bg[:,:,1]=np.clip(bg[:,:,1]+haze*8,0,255)
    for _ in range(int(w*h/1700)):
        x=int(rng.integers(0,w));y=int(rng.integers(0,h))
        k=int(rng.integers(95,210))
        cv2.circle(bg,(x,y),int(rng.random()>.97)+1,(k,k,k),-1,cv2.LINE_AA)
    return bg


class Renderer:
    def __init__(self, project:dict, basedir:Path):
        self.project=project;self.basedir=basedir
        self.w,self.h,self.fps,self.duration=validate(project)
        bgref=project.get('map',{}).get('image','assets/demo-map.jpg')
        mapim=asset_image(bgref,basedir,Image.open(ROOT/'assets/demo-map.jpg').convert('RGB'))
        self.map=cv2.cvtColor(np.array(mapim.resize((self.w,self.h),Image.Resampling.LANCZOS)),cv2.COLOR_RGB2BGR)
        earth=Image.open(ROOT/'assets/earth.png').convert('RGB')
        self.earth=cv2.cvtColor(np.array(earth),cv2.COLOR_RGB2BGR)
        self.stars=make_stars(self.w,self.h)
        self.intro=float(project.get('intro',{}).get('duration',0))
        self.actors={a['id']:a for a in project.get('actors',[])}
        self.avatars={}
        for a in project.get('actors',[]):
            if a.get('avatar'):
                im=asset_image(a['avatar'],basedir)
                if im:self.avatars[a['id']]=im

    def camera(self,t):
        pts=self.project.get('camera',[]) or [{'t':0,'x':.5,'y':.5,'zoom':1,'rotation':0}]
        return interpolate(pts,t,('x','y','zoom','rotation'))

    def matrix(self,t):
        c=self.camera(t)
        cx,cy=c['x']*self.w,c['y']*self.h
        M=cv2.getRotationMatrix2D((cx,cy),-c['rotation'],clamp(c['zoom'],.5,5))
        M[0,2]+=self.w*.5-cx;M[1,2]+=self.h*.5-cy
        return M

    def xy(self,x,y,M):
        return (float(M[0,0]*x*self.w+M[0,1]*y*self.h+M[0,2]),
                float(M[1,0]*x*self.w+M[1,1]*y*self.h+M[1,2]))

    def globe(self,t):
        w,h=self.w,self.h
        im=self.stars.copy()
        cfg=self.project.get('intro',{})
        u=clamp(t/max(.01,self.intro),0,1)
        radius=int(min(w,h)*(.26+.11*u))
        cx=int(w*.50);cy=int(h*.50)
        # Sphere texture sampling in orthographic projection.
        size=radius*2+1
        yy,xx=np.mgrid[-radius:radius+1,-radius:radius+1].astype(np.float32)
        x=xx/radius;y=-yy/radius
        rho2=x*x+y*y;mask=rho2<=1
        z=np.sqrt(np.maximum(0,1-rho2))
        lat0=math.radians(float(cfg.get('latitude',25)))
        lat=np.arcsin(np.clip(y*math.cos(lat0)+z*math.sin(lat0),-1,1))
        lon0=math.radians(lerp(float(cfg.get('start_longitude',-135)),float(cfg.get('end_longitude',-65)),u))
        lon=lon0+np.arctan2(x,z*math.cos(lat0)-y*math.sin(lat0))
        eh,ew=self.earth.shape[:2]
        mapx=np.mod((lon/(2*math.pi)+.5)*ew,ew).astype(np.float32)
        mapy=np.clip((.5-lat/math.pi)*eh,0,eh-1).astype(np.float32)
        ball=cv2.remap(self.earth,mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_WRAP)
        lighting=np.clip(.48+.60*(.38*x+.40*y+.75*z),.22,1.08)
        ball=np.clip(ball*lighting[:,:,None],0,255).astype('uint8')
        # Atmosphere rim and glow.
        cv2.circle(im,(cx,cy),radius+7,(75,62,29),12,cv2.LINE_AA)
        y0=cy-radius;x0=cx-radius
        sub=im[y0:y0+size,x0:x0+size]
        sub[mask]=ball[mask]
        cv2.circle(im,(cx,cy),radius,(170,125,45),2,cv2.LINE_AA)
        return im

    def map_background(self,t):
        M=self.matrix(t)
        return cv2.warpAffine(self.map,M,(self.w,self.h),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101),M

    def draw_actor(self,d:ImageDraw.ImageDraw,frame:Image.Image,a:dict,t:float,M):
        pts=a.get('points',[])
        if not pts or t<float(min(p['t'] for p in pts)):return
        pos=interpolate(pts,t)
        x,y=self.xy(pos['x'],pos['y'],M)
        if x< -100 or x>self.w+100 or y< -100 or y>self.h+100:return
        x=int(x);y=int(y)
        color=rgba(a.get('color','#ef525b'))
        scale=clamp(float(a.get('size',1)),.4,3)
        r=int(clamp(self.h*.024*scale,11,54))
        future=interpolate(pts,min(self.duration,t+.12))
        prev=interpolate(pts,max(0,t-.12))
        heading=math.atan2(future['y']-prev['y'],future['x']-prev['x'])
        if a.get('kind')=='car':
            # A top-down car with directional windshield.
            ca,sa=math.cos(heading),math.sin(heading)
            def rot(dx,dy):return (int(x+dx*ca-dy*sa),int(y+dx*sa+dy*ca))
            corners=[rot(-r*1.6,-r*.7),rot(r*1.6,-r*.7),rot(r*1.6,r*.7),rot(-r*1.6,r*.7)]
            d.polygon([(xx+3,yy+5) for xx,yy in corners],fill=(5,10,15))
            d.polygon(corners,fill=color,outline=(245,245,245),width=2)
            d.polygon([rot(r*.25,-r*.55),rot(r*.95,-r*.55),rot(r*.95,r*.55),rot(r*.25,r*.55)],fill=(31,48,61))
            d.line([rot(-r*.75,-r*.55),rot(-r*.75,r*.55)],fill=(241,246,255),width=2)
        else:
            d.ellipse((x-r-4,y-r-1,x+r+4,y+r+7),fill=(8,15,20))
            d.ellipse((x-r-3,y-r-3,x+r+3,y+r+3),fill=color)
            d.ellipse((x-r+2,y-r+2,x+r-2,y+r-2),fill=(26,36,46))
            if a['id'] in self.avatars:
                av=self.avatars[a['id']].resize((2*r-4,2*r-4),Image.Resampling.LANCZOS)
                mask=Image.new('L',av.size);ImageDraw.Draw(mask).ellipse((0,0,*av.size),fill=255)
                frame.paste(av,(x-r+2,y-r+2),mask)
            else:
                d.ellipse((x-r//3,y-r//2,x+r//3,y+r//5),fill=(217,219,211))
                d.arc((x-r//2,y-r//2,x+r//2,y+r//2),210,330,fill=(255,255,255),width=2)
            # Heading pointer
            if abs(future['x']-prev['x'])+abs(future['y']-prev['y'])>.0001:
                d.line((x,y,int(x+math.cos(heading)*r*1.5),int(y+math.sin(heading)*r*1.5)),fill=(255,255,255),width=3)
        label=str(a.get('name',a['id']))[:24]
        f=font(int(self.h*.021))
        box=d.textbbox((0,0),label,font=f,stroke_width=0)
        tw=box[2]-box[0];th=box[3]-box[1]
        bx=x-tw//2-9;by=y+r+10
        d.rounded_rectangle((bx,by,bx+tw+18,by+th+11),radius=6,fill=(9,17,24))
        d.text((x-tw//2,by+3),label,font=f,fill=(245,247,251))

    def draw_events(self,d,t,M):
        for event in self.project.get('events',[]):
            age=t-float(event.get('t',0));kind=event.get('type')
            duration=.35 if kind=='gunfire' else 1.1
            if not 0<=age<duration:continue
            actor=self.actors.get(event.get('actor'))
            if not actor or not actor.get('points'):continue
            pos=interpolate(actor['points'],t)
            x,y=self.xy(pos['x'],pos['y'],M)
            x=int(x);y=int(y)
            if kind=='alert':
                s=int(self.h*.038*(1+.2*math.sin(age*12)))
                d.ellipse((x-s,y-s-46,x+s,y+s-46),outline=(255,202,59),width=4)
                d.text((x-8,y-s-60),'!',font=font(int(self.h*.05)),fill=(255,225,80),stroke_width=1,stroke_fill=(24,26,23))
            if kind=='gunfire':
                direction=math.radians(float(event.get('direction',-30)))
                ex=x+math.cos(direction)*self.h*.18;ey=y+math.sin(direction)*self.h*.18
                alpha=1-age/duration
                col=(255,int(185+55*alpha),int(75+80*alpha))
                d.line((x,y,ex,ey),fill=col,width=max(2,int(self.h*.008*alpha)))
                r=int(self.h*.027*(.6+alpha))
                for i in range(8):
                    a=2*math.pi*i/8
                    d.line((x+math.cos(a)*r*.2,y+math.sin(a)*r*.2,x+math.cos(a)*r,y+math.sin(a)*r),fill=(255,232,114),width=3)

    def overlay(self,arr:np.ndarray,t:float,M=None):
        frame=Image.fromarray(cv2.cvtColor(arr,cv2.COLOR_BGR2RGB))
        d=ImageDraw.Draw(frame)
        w,h=self.w,self.h
        if t>=self.intro:
            if M is None:M=self.matrix(t)
            if self.project.get('show_tracks',True):
                for a in self.project.get('actors',[]):
                    pts=[p for p in sorted(a.get('points',[]),key=lambda p:p['t']) if float(p['t'])<=t]
                    if len(pts)<2:continue
                    color=rgba(a.get('color','#ef525b'))
                    for p,q in zip(pts,pts[1:]):
                        p0=self.xy(p['x'],p['y'],M);p1=self.xy(q['x'],q['y'],M)
                        d.line((p0[0],p0[1],p1[0],p1[1]),fill=color,width=max(2,int(h*.003)))
            for a in self.project.get('actors',[]):self.draw_actor(d,frame,a,t,M)
            self.draw_events(d,t,M)
        # Editorial HUD and disclosure.
        d.rounded_rectangle((int(w*.026),int(h*.036),int(w*.36),int(h*.13)),radius=13,fill=(9,17,26))
        d.text((int(w*.044),int(h*.048)),str(self.project.get('title','案件地图还原'))[:28],font=font(int(h*.033)),fill=(245,247,251))
        d.text((int(w*.044),int(h*.101)),str(self.project.get('subtitle','CASE MAP STUDIO'))[:45],font=font(int(h*.017)),fill=(117,183,214))
        # Captions
        caption=''
        for cap in self.project.get('captions',[]):
            if float(cap.get('start',0))<=t<float(cap.get('end',0)):caption=str(cap.get('text',''));break
        if caption:
            f=font(int(h*.037));bb=d.textbbox((0,0),caption,font=f)
            tw=bb[2]-bb[0];cx=w//2
            d.rounded_rectangle((cx-tw//2-22,int(h*.84),cx+tw//2+22,int(h*.915)),radius=12,fill=(8,15,21))
            d.text((cx-tw//2,int(h*.852)),caption,font=f,fill=(255,255,255))
        note='案件过程示意动画 · 非真实现场画面'
        d.text((int(w*.025),int(h*.963)),note,font=font(int(h*.017)),fill=(222,232,238),stroke_width=1,stroke_fill=(13,19,23))
        credit=str(self.project.get('map',{}).get('credit','原创示例地图'))
        b=d.textbbox((0,0),credit,font=font(int(h*.016)))
        d.text((w-(b[2]-b[0])-int(w*.02),int(h*.963)),credit,font=font(int(h*.016)),fill=(218,229,233),stroke_width=1,stroke_fill=(13,19,23))
        return np.array(frame)

    def frame(self,t):
        t=clamp(t,0,self.duration)
        if self.intro>0 and t<self.intro:
            globe=self.globe(t)
            fade=clamp((t-(self.intro-.85))/.85,0,1)
            if fade:
                mp,M=self.map_background(t)
                globe=cv2.addWeighted(globe,1-fade,mp,fade,0)
            return self.overlay(globe,t)
        bg,M=self.map_background(t)
        return self.overlay(bg,t,M)


def run():
    ap=argparse.ArgumentParser(description='Render CaseMap Studio project')
    ap.add_argument('--project',default='examples/demo.json')
    ap.add_argument('--output',default='case-map.mp4')
    ap.add_argument('--preview',type=float,help='Render one PNG at specified time (seconds)')
    ap.add_argument('--check',action='store_true',help='Validate project and exit')
    ap.add_argument('--audio',help='Optional narration/music track to mux into MP4')
    ap.add_argument('--max-frames',type=int,help='Limit frame count for development smoke tests')
    args=ap.parse_args()
    projectpath=Path(args.project).resolve()
    project=json.loads(projectpath.read_text(encoding='utf-8'))
    render=Renderer(project,projectpath.parent)
    if args.check:
        print(f'Valid project: {render.w}x{render.h} {render.fps}fps {render.duration}s');return
    output=Path(args.output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
    if args.preview is not None:
        path=output if output.suffix.lower()=='.png' else output.with_suffix('.png')
        Image.fromarray(render.frame(args.preview)).save(path)
        print('Saved preview:',path);return
    if not shutil.which('ffmpeg'):raise RuntimeError('FFmpeg not installed')
    count=math.ceil(render.duration*render.fps)
    if args.max_frames:count=min(count,args.max_frames)
    video_output=output if not args.audio else output.with_name(output.stem+'-silent.mp4')
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24',
         '-s',f'{render.w}x{render.h}','-r',str(render.fps),'-i','pipe:0','-an','-c:v','libx264',
         '-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(video_output)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for i in range(count):
            p.stdin.write(render.frame(i/render.fps).tobytes())
            if i%max(1,render.fps*3)==0:print(f'Rendering {i}/{count}',flush=True)
        p.stdin.close()
        stderr=p.stderr.read().decode(errors='replace')
        rc=p.wait()
        if rc:raise RuntimeError('ffmpeg failed: '+stderr)
    except Exception:
        p.kill();p.wait();raise
    if args.audio:
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(video_output),'-i',args.audio,
                        '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-shortest','-movflags','+faststart',str(output)],check=True)
        video_output.unlink(missing_ok=True)
    print('MP4 saved:',output,'frames:',count)

if __name__=='__main__':run()
