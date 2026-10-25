// Browser-side logic that has no DOM dependency is imported straight from
// public/js and tested here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore, sessionIsDead } from '../public/js/session.js';
import { createShuffleTracker } from '../public/js/shuffleTracker.js';
import { createInflightGate } from '../public/js/inflight.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('session store round-trips, clears, and tolerates garbage and a throwing storage', () => {
  const store = createSessionStore(fakeStorage());
  assert.equal(store.load(), null);
  store.save({ code: 'ABCD', playerId: 'p', resumeToken: 't' });
  assert.deepEqual(store.load(), { code: 'ABCD', playerId: 'p', resumeToken: 't' });
  store.clear();
  assert.equal(store.load(), null);

  const bad = fakeStorage();
  bad.setItem('vcSession', '{not json');
  assert.equal(createSessionStore(bad).load(), null);

  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const s = createSessionStore(throwing);
  assert.equal(s.load(), null);
  assert.doesNotThrow(() => s.save({ code: 'X' }));
  assert.doesNotThrow(() => s.clear());
});

test('only gone/unauthorized kill a saved seat; transient errors keep it', () => {
  assert.equal(sessionIsDead('gone'), true);
  assert.equal(sessionIsDead('unauthorized'), true);
  assert.equal(sessionIsDead('timeout'), false);
  assert.equal(sessionIsDead('offline'), false);
  assert.equal(sessionIsDead('no-ack'), false);
  assert.equal(sessionIsDead(undefined), false);
});

test('shuffle tracker flashes once per shuffleId across rounds', () => {
  const t = createShuffleTracker();
  assert.equal(t.isNew('r0-v2'), true);
  assert.equal(t.isNew('r0-v2'), false);
  assert.equal(t.isNew('r0-v3'), true);
  // Next round restarts versions at 2; must still flash.
  assert.equal(t.isNew('r1-v2'), true);
  assert.equal(t.isNew(null), false);
  assert.equal(t.isNew(undefined), false);
});

test('inflight gate locks on send, unlocks on a rejected ack, stays locked on ok until released, and times out', () => {
  let now = 1000;
  const gate = createInflightGate({ timeoutMs: 3000, now: () => now });
  assert.equal(gate.locked, false);
  gate.lock();
  assert.equal(gate.locked, true);
  assert.equal(gate.settle({ ok: true, result: 'ok' }), 'waiting');
  assert.equal(gate.locked, true);
  gate.release();
  assert.equal(gate.locked, false);

  gate.lock();
  assert.equal(gate.settle({ ok: false, error: 'stale' }), 'unlocked');
  assert.equal(gate.locked, false);

  gate.lock();
  now += 2999;
  assert.equal(gate.locked, true);
  now += 1;
  assert.equal(gate.locked, false);
});
