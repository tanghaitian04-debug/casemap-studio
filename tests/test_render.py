from pathlib import Path
import json
import numpy as np
import pytest
from render import Renderer, validate, interpolate

ROOT=Path(__file__).resolve().parents[1]
DEMO=ROOT/'examples/demo.json'

@pytest.fixture
def project():return json.loads(DEMO.read_text(encoding='utf-8'))

def test_demo_valid(project):
    assert validate(project)==(1280,720,30,30.0)

def test_interpolate():
    points=[{'t':1,'x':0,'y':1},{'t':3,'x':1,'y':0}]
    assert interpolate(points,2)=={'x':.5,'y':.5}
    assert interpolate(points,0)=={'x':0.,'y':1.}
    assert interpolate(points,5)=={'x':1.,'y':0.}

def test_duplicate_actor_id_rejected(project):
    project['actors'].append(project['actors'][0])
    with pytest.raises(ValueError):validate(project)

def test_outside_map_rejected(project):
    project['actors'][0]['points'][0]['x']=-.1
    with pytest.raises(ValueError):validate(project)

def test_bad_duration_rejected(project):
    project['duration']=10000
    with pytest.raises(ValueError):validate(project)

def test_intro_and_chase_frames_are_different(project):
    project['size']=[640,360]
    r=Renderer(project,DEMO.parent)
    intro=r.frame(1.5);chase=r.frame(10)
    assert intro.shape==(360,640,3)
    assert chase.shape==(360,640,3)
    assert np.abs(intro.astype('int16')-chase.astype('int16')).mean()>20

def test_camera_and_actor_positions(project):
    project['size']=[640,360]
    r=Renderer(project,DEMO.parent)
    a=r.actors['suspect'];p=interpolate(a['points'],9)
    x,y=r.xy(p['x'],p['y'],r.matrix(9))
    assert 0<=x<=640 and 0<=y<=360
