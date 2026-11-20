const test = require('node:test');
const assert = require('node:assert/strict');
const Film = require('../documentary.js');
const draft = require('../examples/copa-2025-0001636-review-pilot.json');

test('COPA Hubbard review pilot validates and fits V2 duration cap', () => {
  assert.equal(Film.validate(draft), draft);
  const timeline = Film.sequence(draft.scenes);
  assert.ok(timeline.at(-1).end <= 180);
  assert.equal(draft.reviewed, false);
  assert.equal(draft.assets && Object.keys(draft.assets).length, 0);
  assert.ok(draft.sources.some(x => x.id === 'copa' && x.status === 'verified'));
  assert.ok(draft.events.filter(x => x.route_status === 'illustrative').length > 0);
  assert.ok(draft.scenes.some(x => x.type === 'GlobeScene'));
  assert.ok(draft.scenes.some(x => x.caption.includes('待核') || x.caption.includes('近似')));
});
