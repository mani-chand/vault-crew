import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/rng.js';
import { createFakeClock } from './fakeClock.js';
import { generateManuals, MODULE_IDS } from '../server/modules/index.js';
import { DEFAULT_TIMINGS, ROUND_MS } from '../server/constants.js';
import { Round } from '../server/round.js';

const START = 1000;

function mk(over = {}) {
  const events = [];
  const clock = createFakeClock(START);
  const burden = {};
  const r = new Round({
    roundIndex: 0,
    crackerId: 'c',
    crewIds: ['a', 'b', 'x'],
    manuals: generateManuals(createRng(1)),
    burden,
    rng: createRng(2),
    clock,
    timings: DEFAULT_TIMINGS,
    onEvent: (type, data) => events.push([type, data]),
    ...over,
  });
  r.start();
  return { r, clock, events, burden };
}

const uncutIndices = (p) => p.view.wires.map((_, i) => i).filter((i) => !p.view.wires[i].cut);

// White-box: drive each module to solved from its secret.
function solveModule(r, id) {
  const p = r.puzzles[id];
  const act = (a) => r.action('c', id, r.seqOf(id), a);
  switch (id) {
    case 'circuit':
      return act({ wire: uncutIndices(p)[p.secret.cutIndex] });
    case 'tumbler': {
      let res;
      for (const s of p.secret.sequence) res = act({ number: s.number, dir: s.dir });
      return res;
    }
    case 'glyphpad': {
      let res;
      for (const g of p.secret.order) res = act({ glyph: g });
      return res;
    }
    case 'pulse': {
      let res;
      for (const c of p.secret.presses) res = act({ color: c });
      return res;
    }
    default:
      throw new Error(id);
  }
}

function wrongWire(r) {
  const p = r.puzzles.circuit;
  const target = uncutIndices(p)[p.secret.cutIndex];
  return uncutIndices(p).find((i) => i !== target);
}

test('start sets timing, open modules, zero strikes, roles and version 1', () => {
  const { r } = mk();
  assert.equal(r.startedAt, START);
  assert.equal(r.endsAt, START + ROUND_MS);
  assert.equal(r.strikes, 0);
  assert.equal(r.ended, false);
  assert.equal(r.result, null);
  assert.equal(r.assignmentVersion, 1);
  assert.deepEqual(r.moduleStatus(), { circuit: 'open', tumbler: 'open', glyphpad: 'open', pulse: 'open' });
  assert.equal(r.roleOf('c'), 'cracker');
  for (const id of ['a', 'b', 'x']) assert.equal(r.roleOf(id), 'crew');
  assert.equal(r.roleOf('zzz'), null);
  assert.equal(r.shuffleEnabled, true);
  assert.equal(r.nextShuffleAt, START + 60000);
});

test('pages cover all four modules across the crew; each page carries moduleId, name and manual', () => {
  const { r } = mk();
  const all = ['a', 'b', 'x'].flatMap((id) => r.pagesFor(id));
  assert.deepEqual(all.map((p) => p.moduleId).sort(), [...MODULE_IDS].sort());
  for (const p of all) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.manual);
  }
});

test('timeout ends round with result timeout at exactly 240000', () => {
  const { r, clock, events } = mk();
  clock.advance(ROUND_MS - 1);
  assert.equal(r.ended, false);
  clock.advance(1);
  assert.equal(r.ended, true);
  assert.equal(r.result, 'timeout');
  assert.deepEqual(events.at(-1), ['ended', { result: 'timeout' }]);
  assert.equal(r.summary().timeLeftMs, 0);
});

test('non-cracker action rejected not-cracker', () => {
  const { r } = mk();
  assert.deepEqual(r.action('a', 'circuit', 0, { wire: 0 }), { ok: false, error: 'not-cracker' });
  assert.deepEqual(r.action('nobody', 'circuit', 0, { wire: 0 }), { ok: false, error: 'not-cracker' });
  assert.equal(r.strikes, 0);
});

test('bad module id and bad action shapes are rejected without a strike', () => {
  const { r } = mk();
  assert.deepEqual(r.action('c', 'nope', 0, { wire: 0 }), { ok: false, error: 'bad-module' });
  assert.deepEqual(r.action('c', 'circuit', 0, null), { ok: false, error: 'bad-action' });
  assert.deepEqual(r.action('c', 'circuit', 'x', { wire: 0 }), { ok: false, error: 'stale' });
  assert.equal(r.strikes, 0);
});

test('stale seq ignored: same seq sent twice gives one strike', () => {
  const { r, events } = mk();
  const w = wrongWire(r);
  assert.deepEqual(r.action('c', 'circuit', 0, { wire: w }), { ok: true, result: 'strike' });
  assert.deepEqual(r.action('c', 'circuit', 0, { wire: w }), { ok: false, error: 'stale' });
  assert.equal(r.strikes, 1);
  assert.equal(r.seqOf('circuit'), 1);
  assert.deepEqual(events.filter(([t]) => t === 'strike'), [['strike', { strikes: 1, moduleId: 'circuit' }]]);
});

test('an ignored (ok) module action still advances seq', () => {
  const { r } = mk();
  const w = wrongWire(r);
  r.action('c', 'circuit', 0, { wire: w });
  assert.deepEqual(r.action('c', 'circuit', 1, { wire: w }), { ok: true, result: 'ok' });
  assert.equal(r.seqOf('circuit'), 2);
  assert.equal(r.strikes, 1);
});

test('third strike locks the vault and emits ended locked', () => {
  const { r, events } = mk();
  const p = r.puzzles.pulse;
  const wrong = ['red', 'green', 'blue', 'yellow'].find((c) => c !== p.secret.presses[0]);
  for (let i = 0; i < 3; i++) r.action('c', 'pulse', i, { color: wrong });
  assert.equal(r.strikes, 3);
  assert.equal(r.ended, true);
  assert.equal(r.result, 'locked');
  assert.deepEqual(events.at(-1), ['ended', { result: 'locked' }]);
});

test('solving all four opens the vault; summary has time left and solved count', () => {
  const { r, clock, events } = mk();
  clock.advance(30000);
  for (const id of MODULE_IDS) {
    const res = solveModule(r, id);
    assert.deepEqual(res, { ok: true, result: 'solved' });
    assert.equal(r.moduleStatus()[id], 'solved');
  }
  assert.equal(r.ended, true);
  assert.equal(r.result, 'opened');
  assert.deepEqual(r.summary(), { result: 'opened', timeLeftMs: ROUND_MS - 30000, strikes: 0, solvedCount: 4, crackerId: 'c' });
  assert.equal(events.filter(([t]) => t === 'moduleSolved').length, 4);
  assert.deepEqual(events.at(-1), ['ended', { result: 'opened' }]);
});

test('action on a solved module is rejected solved, no strike', () => {
  const { r } = mk();
  solveModule(r, 'circuit');
  assert.deepEqual(r.action('c', 'circuit', r.seqOf('circuit'), { wire: 0 }), { ok: false, error: 'solved' });
  assert.equal(r.strikes, 0);
});

test('action after end rejected round-over', () => {
  const { r, clock } = mk();
  clock.advance(ROUND_MS);
  assert.deepEqual(r.action('c', 'circuit', 0, { wire: 0 }), { ok: false, error: 'round-over' });
});

test('deadline boundary: action at endsAt-1 processed; at endsAt rejected and finalised as timeout before the timer fires', () => {
  const a = mk();
  a.clock.set(a.r.endsAt - 1);
  assert.equal(a.r.action('c', 'circuit', 0, { wire: wrongWire(a.r) }).ok, true);

  const b = mk();
  b.clock.set(b.r.endsAt);
  assert.deepEqual(b.r.action('c', 'circuit', 0, { wire: 0 }), { ok: false, error: 'round-over' });
  assert.equal(b.r.result, 'timeout');
  assert.equal(b.events.filter(([t]) => t === 'ended').length, 1);
  b.clock.advance(1);
  assert.equal(b.events.filter(([t]) => t === 'ended').length, 1, 'timer callback must not emit a second ended');
});

test('shuffles fire at 60000, 120000, 180000 with increasing version and distinct shuffleId', () => {
  const { r, clock, events } = mk();
  const before = ['a', 'b', 'x'].map((id) => r.pagesFor(id).map((p) => p.moduleId).sort());
  clock.advance(59999);
  assert.equal(events.filter(([t]) => t === 'shuffle').length, 0);
  clock.advance(1);
  const s1 = events.filter(([t]) => t === 'shuffle');
  assert.equal(s1.length, 1);
  assert.deepEqual(s1[0][1].assignmentVersion, 2);
  assert.equal(s1[0][1].reason, 'scheduled');
  const after = ['a', 'b', 'x'].map((id) => r.pagesFor(id).map((p) => p.moduleId).sort());
  assert.notDeepEqual(after, before);
  assert.equal(r.nextShuffleAt, START + 120000);

  clock.advance(60000);
  clock.advance(60000);
  const all = events.filter(([t]) => t === 'shuffle').map(([, d]) => d);
  assert.deepEqual(all.map((d) => d.assignmentVersion), [2, 3, 4]);
  assert.equal(new Set(all.map((d) => d.shuffleId)).size, 3);
  assert.equal(r.nextShuffleAt, null);
  clock.advance(ROUND_MS);
  assert.equal(events.filter(([t]) => t === 'shuffle').length, 3);
});

test('no shuffle fires after the round ended', () => {
  const { r, clock, events } = mk();
  for (const id of MODULE_IDS) solveModule(r, id);
  assert.equal(r.ended, true);
  clock.advance(ROUND_MS);
  assert.equal(events.filter(([t]) => t === 'shuffle').length, 0);
  assert.equal(r.nextShuffleAt, null);
});

test('scheduled shuffle is skipped while crew count is below 2', () => {
  const { r, clock, events } = mk();
  r.setCrew(['a']);
  const crewChanged = events.filter(([t]) => t === 'shuffle');
  assert.equal(crewChanged.length, 1);
  assert.equal(crewChanged[0][1].reason, 'crewChanged');
  assert.equal(r.shuffleEnabled, false);
  assert.equal(r.nextShuffleAt, null);
  clock.advance(60000);
  assert.equal(events.filter(([t]) => t === 'shuffle').length, 1);
  assert.deepEqual(r.pagesFor('a').map((p) => p.moduleId).sort(), [...MODULE_IDS].sort());
});

test('setCrew reassigns immediately with reason crewChanged and the removed player has no pages or role', () => {
  const { r, events } = mk();
  const v = r.assignmentVersion;
  r.setCrew(['a', 'b']);
  assert.equal(r.assignmentVersion, v + 1);
  assert.deepEqual(events.at(-1)[0], 'shuffle');
  assert.equal(events.at(-1)[1].reason, 'crewChanged');
  assert.deepEqual(r.pagesFor('x'), []);
  assert.equal(r.roleOf('x'), null);
  const all = ['a', 'b'].flatMap((id) => r.pagesFor(id).map((p) => p.moduleId)).sort();
  assert.deepEqual(all, [...MODULE_IDS].sort());
});

test('setCrew with the same crew is a no-op', () => {
  const { r, events } = mk();
  r.setCrew(['x', 'a', 'b']);
  assert.equal(r.assignmentVersion, 1);
  assert.equal(events.filter(([t]) => t === 'shuffle').length, 0);
});

test('pagesFor cracker is empty; crackerModules has no secret and carries seq', () => {
  const { r } = mk();
  assert.deepEqual(r.pagesFor('c'), []);
  const mods = r.crackerModules();
  assert.deepEqual(Object.keys(mods).sort(), [...MODULE_IDS].sort());
  for (const m of Object.values(mods)) {
    assert.equal('secret' in m, false);
    assert.equal(m.seq, 0);
    assert.equal(m.status, 'open');
  }
  assert.equal(JSON.stringify(mods).includes('secret'), false);
});

test('5 crew → one lookout with role lookout; burden is updated', () => {
  const { r, burden } = mk({ crewIds: ['a', 'b', 'd', 'e', 'f'] });
  const lookouts = ['a', 'b', 'd', 'e', 'f'].filter((id) => r.roleOf(id) === 'lookout');
  assert.equal(lookouts.length, 1);
  assert.deepEqual(r.pagesFor(lookouts[0]), []);
  assert.equal(burden[lookouts[0]].lookout, 1);
});

test('3 crew → the extra holder gets double burden', () => {
  const { r, burden } = mk();
  const doubles = ['a', 'b', 'x'].filter((id) => r.pagesFor(id).length === 2);
  assert.equal(doubles.length, 1);
  assert.equal(burden[doubles[0]].double, 1);
});

test('crackerLeft ends locked', () => {
  const { r, events } = mk();
  r.crackerLeft();
  assert.equal(r.result, 'locked');
  assert.deepEqual(events.at(-1), ['ended', { result: 'locked' }]);
});

test('2-player round: single crew holds all pages, shuffle disabled, no shuffle events', () => {
  const { r, clock, events } = mk({ crewIds: ['a'] });
  assert.equal(r.shuffleEnabled, false);
  assert.equal(r.nextShuffleAt, null);
  assert.deepEqual(r.pagesFor('a').map((p) => p.moduleId).sort(), [...MODULE_IDS].sort());
  clock.advance(ROUND_MS);
  assert.equal(events.filter(([t]) => t === 'shuffle').length, 0);
});

test('end is idempotent and clears every timer', () => {
  const { r, clock, events } = mk();
  r.end('locked');
  r.end('timeout');
  assert.equal(r.result, 'locked');
  assert.equal(events.filter(([t]) => t === 'ended').length, 1);
  assert.equal(clock.pending(), 0);
});
