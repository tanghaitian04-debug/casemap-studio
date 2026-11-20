/* Shared project format for the editor, tests and frame renderer. */
(function (root) {
  'use strict';
  const widths = [1280, 1920];
  const kinds = ['officer', 'suspect', 'person', 'civilian', 'car'];
  const effects = {
    alert: '警示符号', gunfire: '示意闪光', ring: '定位圆圈', light: '位置高亮',
    glow: '对象发光', text: '事件文字', shake: '镜头震动', push: '快速推近',
    vignette: '暗角', beacon: '警灯'
  };
  const curves = ['linear', 'smooth', 'in', 'out', 'hold'];
  const draftKey = 'casemap-draft-v1';
  const color = /^#[\da-f]{3}(?:[\da-f]{3})?$/i;
  function validate(project) {
    const require = (ok, path) => { if (!ok) throw new Error('项目字段无效：' + path); };
    const number = (value, lo, hi, path) =>
      require(Number.isFinite(value) && value >= lo && value <= hi, path);
    const string = (value, limit, path) => require(typeof value === 'string' && value.length <= limit, path);
    const list = (value, limit, path) => require(Array.isArray(value) && value.length <= limit, path);
    const object = (value, path) => require(value && typeof value === 'object' && !Array.isArray(value), path);
    const optional = (value, check) => { if (value !== undefined) check(value); };
    const media = (value, path, type = 'image') => {
      string(value, 10_000_000, path);
      const mime = type === 'image' ? 'image/(png|jpeg|webp)' : 'audio/(mpeg|mp4|wav|x-wav|ogg|webm|aac)';
      require(new RegExp('^data:' + mime + ';base64,[A-Za-z0-9+/]+={0,2}$').test(value) ||
        /^assets\/[\w.-]+$/.test(value) && !value.includes('..'), path);
    };
    object(project, '项目');
    require(project.version === 1, '版本');
    const { duration, fps, size, intro, map, camera, actors, events, captions, audio } = project;
    string(project.title, 160, '片名');
    optional(project.subtitle, v => string(v, 160, '副标题'));
    number(duration, 1, 180, '时长');
    number(fps, 1, 60, '帧率');
    require(Number.isInteger(fps), '帧率');
    require(Array.isArray(size) && size.length === 2 && widths.includes(size[0]) && size[0] * 9 === size[1] * 16, '分辨率');
    object(intro, '地球');
    number(intro.duration, 0, duration, '地球时长');
    optional(intro.latitude, v => number(v, -90, 90, '纬度'));
    for (const key of ['start_longitude', 'end_longitude']) optional(intro[key], v => number(v, -180, 180, key));
    optional(intro.place, v => string(v, 80, '地点'));
    object(map, '地图');
    media(map.image, '地图图片');
    string(map.credit, 160, '地图署名');
    const time = (value, path) => number(value, 0, duration, path);
    const xy = item => { number(item.x, 0, 1, 'X'); number(item.y, 0, 1, 'Y'); };
    const point = item => {
      object(item, '关键帧');
      xy(item);
      time(item.t, '关键帧时间');
      optional(item.ease, v => require(curves.includes(v), '缓动'));
      optional(item.note, v => string(v,120,'关键帧备注'));
      optional(item.heading, v => number(v,-360,360,'关键帧朝向'));
      optional(item.motion, v => require(['walk','run','stop'].includes(v),'动作状态'));
    };
    list(actors, 100, '对象轨道');
    const ids = new Set();
    actors.forEach(actor => {
      object(actor, '对象');
      string(actor.id, 120, '对象 ID');
      require(actor.id && !ids.has(actor.id), '重复或空对象 ID');
      ids.add(actor.id);
      string(actor.name ?? '', 120, '对象名称');
      require(kinds.includes(actor.kind), '对象类型');
      optional(actor.color, v => require(typeof v === 'string' && color.test(v), '对象颜色'));
      optional(actor.avatar, v => media(v, '对象图片'));
      optional(actor.size, v => number(v, .25, 4, '对象大小'));
      optional(actor.heading, v => number(v, -360, 360, '对象朝向'));
      optional(actor.layer, v => number(v, -100, 100, '对象层级'));
      for (const k of ['start', 'end']) optional(actor[k], v => time(v, '对象显示时间'));
      optional(actor.route, route => {
        object(route,'运动路线');
        number(route.curve,0,1,'路线圆滑程度');
        number(route.steering,0,1,'路线转向平滑');
        number(route.turnSlow,0,2,'转弯减速');
        require(['linear','in','out'].includes(route.speed),'路线速度');
      });
      list(actor.points, 500, '路径');
      actor.points.forEach(point);
    });
    const target = v => require(v === '' || ids.has(v), '绑定对象');
    list(camera, 500, '镜头轨道');
    require(camera.length > 0, '镜头数量');
    camera.forEach(item => {
      point(item);
      number(item.zoom, .5, 10, '缩放');
      number(item.rotation, -360, 360, '旋转');
      optional(item.tilt, v => number(v, 0, 70, '倾斜'));
      optional(item.target, target);
    });
    list(events, 500, '特效轨道');
    events.forEach(event => {
      object(event, '特效');
      time(event.t, '特效时间');
      require(Object.hasOwn(effects, event.type), '特效类型');
      optional(event.duration, v => number(v, .03, 180, '特效时长'));
      optional(event.actor, target);
      optional(event.color, v => require(typeof v === 'string' && color.test(v), '特效颜色'));
      optional(event.size, v => number(v, .1, 8, '特效大小'));
      optional(event.intensity, v => number(v, 0, 1, '特效强度'));
      optional(event.text, v => string(v, 120, '特效文字'));
    });
    list(captions, 500, '字幕轨道');
    captions.forEach(caption => {
      object(caption, '字幕');
      time(caption.start, '字幕开始');
      number(caption.end, caption.start, duration, '字幕结束');
      string(caption.text, 200, '字幕内容');
    });
    optional(audio, value => {
      list(value, 12, '音效轨道');
      value.forEach(clip => {
        object(clip, '音效');
        time(clip.start, '音效开始');
        string(clip.name, 160, '音效名称');
        media(clip.source, '音效文件', 'audio');
        optional(clip.gain, v => number(v, 0, 2, '音量'));
      });
    });
    return project;
  }
  function restore(storage) {
    try {
      const draft = storage.getItem(draftKey);
      return draft ? validate(JSON.parse(draft)) : null;
    } catch { return null; }
  }
  function save(storage, project) {
    storage.setItem(draftKey, JSON.stringify(project));
  }
  function empty() {
    return {
      version: 1, title: '新案件', duration: 30, fps: 30, size: [1280, 720],
      intro: { duration: 0, latitude: 29, start_longitude: -145, end_longitude: -81, place: '' },
      map: { image: 'assets/demo-map.jpg', credit: '原创虚构示例地图' },
      camera: [{ t: 0, x: .5, y: .5, zoom: 1, rotation: 0 }],
      actors: [], events: [], captions: [], audio: []
    };
  }
  const api = { validate, restore, save, empty, effects, kinds, curves };
  if (typeof module === 'object') module.exports = api;
  else root.CaseMapProject = api;
})(globalThis);
