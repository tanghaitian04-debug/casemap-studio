"""Generate original, synthetic demo assets (no Google imagery or personal data)."""
from pathlib import Path
import math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets'
ASSETS.mkdir(exist_ok=True)


def earth():
    from mpl_toolkits.basemap import Basemap
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig=plt.figure(figsize=(16,8),dpi=128,facecolor='#0b283b')
    ax=fig.add_axes([0,0,1,1]);ax.set_axis_off()
    m=Basemap(projection='cyl',llcrnrlat=-90,urcrnrlat=90,llcrnrlon=-180,urcrnrlon=180,resolution='c',ax=ax)
    m.drawmapboundary(fill_color='#0a3555',linewidth=0)
    m.fillcontinents(color='#527d57',lake_color='#0b3555',zorder=2)
    m.drawcoastlines(color='#6d966c',linewidth=0.27,zorder=3)
    out=ASSETS/'earth.png';fig.savefig(out,dpi=128,pad_inches=0,facecolor='#0b283b');plt.close(fig)
    img=Image.open(out).convert('RGB')
    # Subtle water/land texture for a more cinematic look.
    a=np.asarray(img).astype(np.int16)
    h,w=a.shape[:2]
    rng=np.random.default_rng(15)
    noise=rng.normal(0,4,(h,w,1))
    a=np.clip(a+noise,0,255).astype('uint8')
    Image.fromarray(a).save(out,optimize=True)
    print('earth',out)


def demo_map():
    rng=random.Random(76)
    w,h=1920,1080
    im=Image.new('RGB',(w,h),(73,98,71)); d=ImageDraw.Draw(im,'RGB')
    # Ground blocks, aerial top-down. This is an invented location.
    d.rectangle((0,0,w,h),fill=(70,98,69))
    for _ in range(4200):
        x=rng.randrange(w);y=rng.randrange(h);s=rng.randrange(2,16)
        c=rng.choice([(63,91,58),(78,106,69),(82,112,73),(66,92,64),(90,114,72)])
        d.ellipse((x,y,x+s,y+s),fill=c)
    # Road perimeter and intersections.
    d.polygon([(0,75),(1920,20),(1920,180),(0,245)],fill=(52,56,56))
    d.polygon([(30,0),(250,0),(495,1080),(335,1080)],fill=(60,65,65))
    d.polygon([(0,800),(1920,750),(1920,910),(0,960)],fill=(58,61,62))
    for i in range(0,1920,130):
        d.line((i,160,i+55,158),fill=(174,166,110),width=4)
    # Campus grounds and plaza.
    d.rounded_rectangle((560,260,1760,720),radius=45,fill=(137,143,123),outline=(90,104,90),width=10)
    d.polygon([(550,350),(810,280),(930,390),(860,580),(580,580)],fill=(117,123,115))
    # Buildings shadows + roofs.
    buildings=[(920,290,1410,515),(1450,285,1745,485),(680,475,870,710),(1070,550,1460,720)]
    for j,(x0,y0,x1,y1) in enumerate(buildings):
        d.rectangle((x0+18,y0+22,x1+22,y1+25),fill=(52,64,58))
        d.rectangle((x0,y0,x1,y1),fill=(169+j*5,172+j*3,161+j*4),outline=(219,220,208),width=5)
        for y in range(y0+24,y1-20,39):
            d.line((x0+20,y,x1-18,y),fill=(128,137,134),width=4)
        for x in range(x0+35,x1-20,80):
            d.rectangle((x,y0+30,x+32,y0+48),fill=(90,106,110))
    # Parking lot lower-left, slots and parked cars.
    d.polygon([(535,720),(1030,715),(1070,1030),(605,1040)],fill=(81,86,84))
    for row in range(3):
        for col in range(10):
            x=615+col*40+row*10;y=760+row*85
            d.line((x,y,x+9,y+62),fill=(169,168,152),width=3)
            if rng.random()>.44:
                color=rng.choice([(190,192,190),(43,50,53),(108,123,130),(151,154,157),(157,77,66)])
                d.rounded_rectangle((x+12,y+5,x+31,y+48),radius=5,fill=color,outline=(42,46,44),width=2)
    # Trees as dense canopy clusters.
    for _ in range(450):
        x=rng.randrange(w);y=rng.randrange(h)
        if 580<x<1770 and 260<y<725:continue
        if 520<x<1100 and 720<y<1060:continue
        r=rng.randrange(9,27)
        d.ellipse((x-r+4,y-r+6,x+r+4,y+r+6),fill=(44,70,47))
        d.ellipse((x-r,y-r,x+r,y+r),fill=rng.choice([(40,81,48),(48,89,50),(59,103,60),(67,99,53),(48,82,48)]))
        d.arc((x-r//2,y-r//2,x+r//2,y+r//2),200,330,fill=(83,117,65),width=2)
    # Site plaza and landscaping islands.
    for cx,cy,rr in [(920,620,47),(1560,640,53),(600,390,33)]:
        d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=(90,117,72),outline=(173,175,154),width=8)
        for _ in range(13):
            x=cx+rng.randint(-rr//2,rr//2);y=cy+rng.randint(-rr//2,rr//2)
            d.ellipse((x-5,y-5,x+5,y+5),fill=(49,95,46))
    # Pavement shadows and subtle cinematic color.
    im=im.filter(ImageFilter.GaussianBlur(.45))
    arr=np.asarray(im).astype(np.float32)
    yy,xx=np.ogrid[0:h,0:w]
    vignette=1-.23*((xx-w/2)**2/(w/2)**2+(yy-h/2)**2/(h/2)**2)/2
    arr*=vignette[:,:,None]
    Image.fromarray(np.clip(arr,0,255).astype('uint8')).save(ASSETS/'demo-map.jpg',quality=90,optimize=True)
    print('map',ASSETS/'demo-map.jpg')

if __name__=='__main__':
    earth();demo_map()
