(function (root) {
  'use strict';
  const rules = [
    { word: /接近|走向|靠近|approach/i, text: '人员接近车辆', name: '警员', kind: 'officer', move: true },
    { word: /逃跑|逃离|驶离|启动|flee|drive away/i, text: '车辆驶离', name: '涉事车辆', kind: 'car', move: true },
    { word: /追逐|追赶|跟随|pursue|chase/i, text: '车辆追逐', name: '警车', kind: 'car', move: true },
    { word: /停车(?!场|位|区|区域)|停止|\bstop\b/i, text: '车辆停止', name: '涉事车辆', kind: 'car', move: false },
    { word: /下车|exit/i, text: '人员下车', name: '涉事人员', kind: 'suspect', move: true },
    { word: /开火|枪声|交火|gunfire/i, text: '记录提及枪声', effect: 'gunfire' }
  ];
  function parse(description, format) {
    const text = description.trim();
    if (!text) throw new Error('请输入案件描述');
    const project = format.empty();
    project.title = '待核实案件动画';
    project.subtitle = '规则生成 · 时间与路线均为示意';
    project.intro.duration = 5;
    const fragments = description.split(/[。！？；，,\n]+/).filter(s => s.trim()).slice(0, 25);
    const stages = fragments.flatMap(fragment => {
      const matches = rules.map(rule => ({ ...rule, index: fragment.search(rule.word) }))
        .filter(rule => rule.index >= 0).sort((a, b) => a.index - b.index);
      return matches.length ? matches : [{ text: fragment.trim().slice(0, 66) }];
    }).slice(0, 25);
    project.duration = Math.max(15, 6 + stages.length * 4);
    const actors = new Map();
    stages.forEach((stage, i) => {
      const t = 5 + i * 4;
      project.captions.push({ start: t, end: t + 3.8, text: '示意 · ' + stage.text });
      if (stage.effect) project.events.push({ t: t + 1, type: stage.effect, duration: .35 });
      if (!stage.name) return;
      if (!actors.has(stage.name)) {
        const id = 'object-' + actors.size;
        const point = { t, x: .32, y: .77 - actors.size * .055 };
        actors.set(stage.name, { id, name: stage.name, kind: stage.kind,
          color: actors.size % 2 ? '#ed8667' : '#55cbec', points: [point] });
      }
      const actor = actors.get(stage.name);
      const last = actor.points.at(-1);
      if (last.t < t) actor.points.push({ t, x: last.x, y: last.y, ease: 'hold' });
      if (stage.move) actor.points.push({ t: t + 3.5, x: Math.min(.87, last.x + .16),
        y: last.y - .025, ease: 'smooth' });
      project.camera.push({ t, x: .5, y: .6, zoom: 1.15, rotation: 0,
        ...(actor.kind === 'car' && stage.move ? { target: actor.id } : {}) });
    });
    project.actors = [...actors.values()];
    return format.validate(project);
  }
  if (typeof module === 'object') module.exports = { parse };
  else root.CaseMapScript = { parse };
})(globalThis);
