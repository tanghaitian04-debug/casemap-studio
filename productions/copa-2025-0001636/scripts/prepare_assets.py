"""Fetch the public map inputs and build the offline render assets."""
import argparse
import concurrent.futures
import json
import re
import subprocess
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / "geo"
IMAGERY = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"
IMAGES = {
    "lake": ("-88.19,41.59,-87.29,42.20", "3500,3190"),
    "chicago": ("-87.66,41.870,-87.598,41.910", "4000,3480"),
    "hubbard": ("-87.640,41.885,-87.620,41.896", "3000,2220"),
}
SOURCES = [
    ("earth.png", "https://svs.gsfc.nasa.gov/vis/a010000/a012500/a012564/frames/5400x2700_2x1_60p/world.topo.2004-04.png"),
    ("street-buildings.osm", "https://api.openstreetmap.org/api/0.6/map?bbox=-87.632,41.887,-87.623,41.893"),
]
SOURCES.extend((name+".jpg", IMAGERY+"?"+urllib.parse.urlencode(
    dict(bbox=bbox,bboxSR=4326,imageSR=4326,size=size,format="jpg",f="image")))
    for name,(bbox,size) in IMAGES.items())


def fetch(item):
    name,url = item
    destination = GEO / name
    if destination.exists():
        return
    partial = destination.with_suffix(".part")
    subprocess.run(["curl","-fLsS","--retry","2","--max-time","100",url,"-o",str(partial)],check=True)
    partial.replace(destination)


def prepare_imagery():
    for name in IMAGES:
        with Image.open(GEO/(name+".jpg")) as source:
            values=np.array(source.convert("RGB"))
        h,w=values.shape[:2]
        x=np.minimum(np.arange(w),np.arange(w)[::-1])
        y=np.minimum(np.arange(h),np.arange(h)[::-1])
        margin={"lake":360,"chicago":280,"hubbard":120}[name]
        edge=np.clip(np.minimum(y[:,None],x[None,:])/margin,0,1)
        edge=edge*edge*(3-2*edge)
        if name=="lake":
            # Over the lake, replace blank tiles and tone-match open water across NAIP flight strips.
            # Preserve observed shorelines and inland features.
            rgb=values.astype(float)
            east=np.arange(w)[None,:]/w
            south=np.arange(h)[:,None]/h
            delta=rgb[:,:,2]-rgb[:,:,0]
            water=np.clip((delta-3)/12,0,1)*np.clip((east-(.18+.49*south))/.09,0,1)
            water=np.maximum(water,values.max(axis=2)<22)
            mask=Image.fromarray((water*255).astype("uint8")).filter(ImageFilter.GaussianBlur(2))
            weight=np.asarray(mask,dtype=float)[:,:,None]/255
            deep=np.empty_like(rgb)
            deep[:,:,0]=37+11*south;deep[:,:,1]=68+8*south;deep[:,:,2]=92+5*south
            values=np.rint(rgb*(1-weight)+deep*weight).astype("uint8")
        rgba=Image.fromarray(np.dstack([values,(edge*255).astype("uint8")]))
        rgba.save(GEO/(name+".webp"),quality=89,method=4)
    with Image.open(GEO/"earth.png") as world:
        world.convert("RGB").save(GEO/"earth.jpg",quality=92,optimize=True)


def point_in_ring(lon,lat,ring):
    hit=False
    for (x,y),(xx,yy) in zip(ring,ring[1:]):
        if (y>lat)!=(yy>lat) and lon<(xx-x)*(lat-y)/(yy-y)+x:
            hit=not hit
    return hit


def models():
    root=ET.parse(GEO/"street-buildings.osm").getroot()
    nodes={n.attrib["id"]:[float(n.attrib["lon"]),float(n.attrib["lat"])] for n in root.findall("node")}
    def tags(el):
        return {t.attrib["k"]:t.attrib["v"] for t in el.findall("tag")}
    hotel=next(nodes[n.attrib["id"]] for n in root.findall("node") if tags(n).get("name")=="Courtyard Chicago Downtown/River North")
    store_nodes=[nodes[n.attrib["id"]] for n in root.findall("node") if tags(n).get("name")=="7-Eleven"
                 and abs(nodes[n.attrib["id"]][0]+87.628)<0.0006 and abs(nodes[n.attrib["id"]][1]-41.89)<0.0012]
    meta=json.loads((GEO/"metadata.json").read_text())
    meta["mapHotel"]=hotel
    if len(store_nodes)==1:
        meta["store"]=store_nodes[0]
    results=[]; roads=[]
    for way in root.findall("way"):
        attr=tags(way)
        ring=[nodes[nd.attrib["ref"]] for nd in way.findall("nd") if nd.attrib["ref"] in nodes]
        if len(ring)<2:
            continue
        if attr.get("highway") in {"primary","secondary","tertiary","residential","unclassified","living_street"} and attr.get("name"):
            roads.append({"name":attr["name"],"points":ring})
        if len(ring)<4 or ring[0]!=ring[-1] or not attr.get("building") or attr["building"]=="no":
            continue
        if min(abs(p[0]-hotel[0]) for p in ring)>0.0042 or min(abs(p[1]-hotel[1]) for p in ring)>0.0031:
            continue
        is_hotel=point_in_ring(*hotel,ring)
        src="height"
        val=re.fullmatch(r"([0-9.]+)\s*(?:m)?",attr.get("height",""))
        if val:
            height=float(val.group(1))
        elif re.fullmatch(r"[0-9.]+",attr.get("building:levels","")):
            height=float(attr["building:levels"])*3.3
            src="levels"
        else:
            # An unmeasured footprint stays in the aerial imagery.
            continue
        if not 2<=height<=500:
            continue
        if is_hotel:
            meta["hotelHeight"]=height
        results.append({"id":way.attrib["id"],"polygons":[[ring]],"height":height,"heightSource":src,
                        "shade":int(way.attrib["id"])%4,"hotel":is_hotel})
    meta["buildingCount"]=len(results)
    for name, payload in [("metadata",meta),("models",results),("roads",roads)]:
        (GEO/(name+".json")).write_text(json.dumps(payload,separators=(",",":"))+"\n")
    print(f"Hotel marker {hotel}. {len(results)} building volumes and {len(roads)} road segments.")


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--local",action="store_true",help="Use previously downloaded public inputs")
    args=parser.parse_args()
    if not args.local:
        with concurrent.futures.ThreadPoolExecutor(5) as pool:
            list(pool.map(fetch,SOURCES))
    prepare_imagery()
    models()
