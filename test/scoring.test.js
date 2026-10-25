import test from 'node:test';
import assert from 'node:assert/strict';
import { roundScore, awards } from '../server/scoring.js';
import { ROUND_MS } from '../server/constants.js';

test('opened: 1000 + 5*sec - 150*strikes, seconds floored', () => {
  assert.equal(roundScore({ result: 'opened', timeLeftMs: 90500, strikes: 1 }), 1300);
  assert.equal(roundScore({ result: 'opened', timeLeftMs: 0, strikes: 2 }), 700);
  assert.equal(roundScore({ result: 'opened', timeLeftMs: 240000, strikes: 0 }), 2200);
});

test('locked and timeout score 0', () => {
  assert.equal(roundScore({ result: 'locked', timeLeftMs: 100000, strikes: 3 }), 0);
  assert.equal(roundScore({ result: 'timeout', timeLeftMs: 0, strikes: 1 }), 0);
});

const r = (roundIndex, crackerId, result, timeLeftMs, strikes) => ({
  roundIndex, crackerId, result, timeLeftMs, strikes, score: roundScore({ result, timeLeftMs, strikes }),
});

test('awards: mvp highest score, fastest least elapsed, cleanest fewest strikes with faster tiebreak', () => {
  const rounds = [
    r(0, 'a', 'opened', 100000, 2), // score 1200, elapsed 140000
    r(1, 'b', 'opened', 150000, 1), // score 1600, elapsed 90000
    r(2, 'c', 'locked', 200000, 3), // 0
    r(3, 'd', 'opened', 120000, 1), // score 1450, elapsed 120000
    r(4, 'e', 'timeout', 0, 0),     // 0
  ];
  const a = awards(rounds);
  assert.deepEqual(a.mvp, { crackerId: 'b', roundIndex: 1 });
  assert.deepEqual(a.fastest, { crackerId: 'b', roundIndex: 1 });
  // b and d both have 1 strike; b was faster.
  assert.deepEqual(a.cleanest, { crackerId: 'b', roundIndex: 1 });
});

test('awards: cleanest prefers fewer strikes even when slower', () => {
  const rounds = [
    r(0, 'a', 'opened', 200000, 2),
    r(1, 'b', 'opened', 50000, 0),
  ];
  assert.deepEqual(awards(rounds).cleanest, { crackerId: 'b', roundIndex: 1 });
  assert.deepEqual(awards(rounds).fastest, { crackerId: 'a', roundIndex: 0 });
});

test('awards: mvp ties go to the earlier round', () => {
  const rounds = [r(0, 'a', 'opened', 100000, 0), r(1, 'b', 'opened', 100000, 0)];
  assert.deepEqual(awards(rounds).mvp, { crackerId: 'a', roundIndex: 0 });
});

test('awards are null when no round opened', () => {
  assert.deepEqual(awards([r(0, 'a', 'locked', 0, 3), r(1, 'b', 'timeout', 0, 0)]), { mvp: null, fastest: null, cleanest: null });
  assert.deepEqual(awards([]), { mvp: null, fastest: null, cleanest: null });
});

test('elapsed is measured against ROUND_MS', () => {
  assert.equal(ROUND_MS, 240000);
});
