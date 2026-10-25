import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../server/rng.js';
import * as pulse from '../../server/modules/pulse.js';

const fixedManual = {
  tables: {
    SLOW: { red: 'blue', blue: 'red', green: 'yellow', yellow: 'green' },
    FAST: { red: 'green', green: 'blue', blue: 'yellow', yellow: 'red' },
  },
};

test('module id and name', () => {
  assert.equal(pulse.id, 'pulse');
  assert.equal(pulse.name, 'Pulse');
  assert.deepEqual(pulse.COLORS, ['red', 'green', 'blue', 'yellow']);
});

test('tables are derangements of the four colors and SLOW differs from FAST', () => {
  for (let s = 0; s < 200; s++) {
    const { tables } = pulse.generateManual(createRng(s));
    for (const tempo of ['SLOW', 'FAST']) {
      const t = tables[tempo];
      assert.deepEqual(Object.keys(t).sort(), [...pulse.COLORS].sort());
      assert.deepEqual(Object.values(t).sort(), [...pulse.COLORS].sort());
      for (const c of pulse.COLORS) assert.notEqual(t[c], c, `seed ${s} ${tempo} maps ${c} to itself`);
    }
    assert.notDeepEqual(tables.SLOW, tables.FAST, `seed ${s} tables identical`);
  }
});

test('solve maps each flash through the tempo table', () => {
  assert.deepEqual(
    pulse.solve({ sequence: ['red', 'red', 'yellow', 'green'], tempo: 'FAST', progress: 0 }, fixedManual).presses,
    ['green', 'green', 'red', 'blue'],
  );
  assert.deepEqual(
    pulse.solve({ sequence: ['red', 'red', 'yellow', 'green'], tempo: 'SLOW', progress: 0 }, fixedManual).presses,
    ['blue', 'blue', 'green', 'yellow'],
  );
});

test('self-consistent across 500 seeds', () => {
  const manual = pulse.generateManual(createRng(1));
  for (let s = 0; s < 500; s++) {
    const p = pulse.generatePuzzle(createRng(s), manual);
    assert.deepEqual(p.secret, pulse.solve(p.view, manual));
    assert.equal(p.view.sequence.length, 4);
    for (const c of p.view.sequence) assert.ok(pulse.COLORS.includes(c));
    assert.ok(['SLOW', 'FAST'].includes(p.view.tempo));
    assert.equal(p.view.progress, 0);
  }
});

test('four correct presses solve, progress advances', () => {
  const p = pulse.generatePuzzle(createRng(3), fixedManual);
  const [a, b, c, d] = p.secret.presses;
  assert.deepEqual(pulse.validate(p, { color: a }), { result: 'ok' });
  assert.equal(p.view.progress, 1);
  assert.deepEqual(pulse.validate(p, { color: b }), { result: 'ok' });
  assert.deepEqual(pulse.validate(p, { color: c }), { result: 'ok' });
  assert.equal(p.view.progress, 3);
  assert.deepEqual(pulse.validate(p, { color: d }), { result: 'solved' });
});

test('wrong press strikes and resets progress', () => {
  const p = pulse.generatePuzzle(createRng(3), fixedManual);
  const [a, b] = p.secret.presses;
  pulse.validate(p, { color: a });
  const wrong = pulse.COLORS.find((c) => c !== b);
  assert.deepEqual(pulse.validate(p, { color: wrong }), { result: 'strike' });
  assert.equal(p.view.progress, 0);
});

test('malformed press is ok and leaves progress unchanged', () => {
  const p = pulse.generatePuzzle(createRng(3), fixedManual);
  pulse.validate(p, { color: p.secret.presses[0] });
  assert.deepEqual(pulse.validate(p, { color: 'purple' }), { result: 'ok' });
  assert.deepEqual(pulse.validate(p, null), { result: 'ok' });
  assert.deepEqual(pulse.validate(p, {}), { result: 'ok' });
  assert.equal(p.view.progress, 1);
});
