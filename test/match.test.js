import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/rng.js';
import { createFakeClock } from './fakeClock.js';
import { DEFAULT_TIMINGS, ROUNDS_TOTAL } from '../server/constants.js';
import { Match } from '../server/match.js';

function mk(playerIds, over = {}) {
  const events = [];
  const clock = createFakeClock(1000);
  const m = new Match({
    playerIds,
    crackedCounts: {},
    rng: createRng(3),
    clock,
    timings: DEFAULT_TIMINGS,
    onEvent: (type, data) => events.push([type, data]),
    ...over,
  });
  return { m, clock, events };
}

// Plays a round to the given result after `elapsedMs` and records it.
function play(m, clock, presentIds, result, elapsedMs = 0, strikes = 0) {
  const round = m.startRound(presentIds);
  clock.advance(elapsedMs);
  round.strikes = strikes;
  round.end(result);
  m.recordRound(round);
  return round;
}

test('5 players each crack once in join order', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const { m, clock } = mk(ids);
  const crackers = [];
  for (let i = 0; i < ROUNDS_TOTAL; i++) crackers.push(play(m, clock, ids, 'locked').crackerId);
  assert.deepEqual(crackers, ids);
  assert.equal(m.isComplete, true);
});

test('3 players: rotation a,b,c,a,b', () => {
  const ids = ['a', 'b', 'c'];
  const { m, clock } = mk(ids);
  const crackers = [];
  for (let i = 0; i < ROUNDS_TOTAL; i++) crackers.push(play(m, clock, ids, 'locked').crackerId);
  assert.deepEqual(crackers, ['a', 'b', 'c', 'a', 'b']);
  assert.deepEqual(m.crackedCounts, { a: 2, b: 2, c: 1 });
});

test('crackedCounts from a previous match are honoured: players who never cracked go first', () => {
  const ids = ['a', 'b', 'c'];
  const { m, clock } = mk(ids, { crackedCounts: { a: 2, b: 2, c: 1 } });
  assert.equal(m.nextCrackerId(ids), 'c');
  const crackers = [];
  for (let i = 0; i < ROUNDS_TOTAL; i++) crackers.push(play(m, clock, ids, 'locked').crackerId);
  assert.deepEqual(crackers, ['c', 'a', 'b', 'c', 'a']);
});

test('absent scheduled cracker is skipped', () => {
  const ids = ['a', 'b', 'c'];
  const { m, clock } = mk(ids);
  play(m, clock, ids, 'locked');
  // b would be next but is gone.
  const r = play(m, clock, ['a', 'c'], 'locked');
  assert.equal(r.crackerId, 'c');
  assert.deepEqual(r.crewIds, ['a']);
});

test('startRound builds the round from the present roster with the cracker excluded from crew', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const { m } = mk(ids);
  const r = m.startRound(ids);
  assert.equal(r.roundIndex, 0);
  assert.equal(r.crackerId, 'a');
  assert.deepEqual(r.crewIds, ['b', 'c', 'd']);
  assert.equal(r.startedAt, 1000);
  assert.equal(m.roundIndex, 0);
  assert.equal(m.current, r);
});

test('manuals are generated once and shared by all rounds', () => {
  const ids = ['a', 'b'];
  const { m, clock } = mk(ids);
  const r1 = play(m, clock, ids, 'locked');
  const r2 = play(m, clock, ids, 'locked');
  assert.equal(r1.manuals, m.manuals);
  assert.equal(r2.manuals, m.manuals);
  assert.ok(m.manuals.tumbler.table);
});

test('burden carries across rounds: with 3 crew the extra page rotates', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const { m, clock } = mk(ids);
  for (let i = 0; i < 3; i++) play(m, clock, ids, 'locked');
  const doubles = ids.map((id) => m.burden[id]?.double ?? 0);
  assert.equal(doubles.reduce((x, y) => x + y, 0), 3);
  assert.ok(Math.max(...doubles) - Math.min(...doubles) <= 1, `doubles ${doubles}`);
});

test('round events pass through onEvent', () => {
  const ids = ['a', 'b'];
  const { m, clock, events } = mk(ids);
  play(m, clock, ids, 'locked');
  assert.deepEqual(events.at(-1), ['ended', { result: 'locked' }]);
});

test('summary totals scores and computes awards', () => {
  const ids = ['a', 'b', 'c'];
  const { m, clock } = mk(ids);
  play(m, clock, ids, 'opened', 100000, 1); // a: 1000 + 5*140 - 150 = 1550
  play(m, clock, ids, 'locked', 50000, 3);  // b: 0
  play(m, clock, ids, 'opened', 30000, 0);  // c: 1000 + 5*210 = 2050
  const s = m.summary();
  assert.equal(s.rounds.length, 3);
  assert.deepEqual(s.rounds[0], { roundIndex: 0, crackerId: 'a', result: 'opened', timeLeftMs: 140000, strikes: 1, solvedCount: 0, score: 1550 });
  assert.equal(s.rounds[1].score, 0);
  assert.equal(s.total, 3600);
  assert.deepEqual(s.awards.mvp, { crackerId: 'c', roundIndex: 2 });
  assert.deepEqual(s.awards.fastest, { crackerId: 'c', roundIndex: 2 });
  assert.deepEqual(s.awards.cleanest, { crackerId: 'c', roundIndex: 2 });
  assert.equal(m.isComplete, false);
});

test('recordRound ignores a round that is not ended', () => {
  const ids = ['a', 'b'];
  const { m } = mk(ids);
  const r = m.startRound(ids);
  assert.throws(() => m.recordRound(r), /not ended/);
});

test('isComplete after five recorded rounds and startRound refuses a sixth', () => {
  const ids = ['a', 'b'];
  const { m, clock } = mk(ids);
  for (let i = 0; i < ROUNDS_TOTAL; i++) play(m, clock, ids, 'locked');
  assert.equal(m.isComplete, true);
  assert.throws(() => m.startRound(ids), /complete/);
});
