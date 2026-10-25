import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../server/rng.js';
import * as circuit from '../../server/modules/circuit.js';
import { GLYPHS, GLYPH_IDS } from '../../shared/glyphs.js';

const manual = circuit.generateManual(createRng(1));
const view = (colors, voltage) => ({ wires: colors.map((c) => ({ color: c, cut: false })), voltage });
const solveWires = (colors, voltage) => circuit.solve(view(colors, voltage), manual).cutIndex;

test('glyph set has 16 distinct ids with spoken names and svg paths', () => {
  assert.equal(GLYPHS.length, 16);
  assert.equal(new Set(GLYPH_IDS).size, 16);
  assert.deepEqual(GLYPH_IDS, [
    'triangle', 'square', 'circle', 'diamond', 'star', 'hexagon', 'cross', 'arrow',
    'moon', 'bolt', 'wave', 'spiral', 'heart', 'anchor', 'key', 'eye',
  ]);
  for (const g of GLYPHS) {
    assert.equal(typeof g.name, 'string');
    assert.ok(g.name.length > 0);
    assert.match(g.path, /^M/);
  }
});

test('module id and name', () => {
  assert.equal(circuit.id, 'circuit');
  assert.equal(circuit.name, 'Circuit Bank');
});

test('manual has the five rules as readable text', () => {
  assert.equal(manual.rules.length, 5);
  assert.match(manual.rules[0], /no red/i);
  assert.match(manual.rules[4], /voltage/i);
});

test('rule 1: no red → second wire', () => {
  assert.equal(solveWires(['blue', 'green', 'white', 'yellow'], 5), 1);
});

test('rule 2: even voltage with blue → last blue', () => {
  assert.equal(solveWires(['red', 'blue', 'green', 'blue', 'white'], 4), 3);
});

test('rule 3: more than one yellow → first yellow', () => {
  assert.equal(solveWires(['red', 'yellow', 'green', 'yellow'], 3), 1);
});

test('rule 4: exactly one white → wire below it', () => {
  assert.equal(solveWires(['red', 'white', 'green', 'yellow'], 3), 2);
});

test('rule 4 wraps when white is last', () => {
  assert.equal(solveWires(['red', 'green', 'yellow', 'white'], 3), 0);
});

test('rule 5: voltage mod count, 0 means last', () => {
  assert.equal(solveWires(['red', 'green', 'green', 'green'], 3), 2);
  assert.equal(solveWires(['red', 'green', 'green', 'green'], 8), 3);
});

test('whichRule reports the rule that fired', () => {
  assert.equal(circuit.whichRule(view(['blue', 'green', 'white', 'yellow'], 5), manual), 1);
  assert.equal(circuit.whichRule(view(['red', 'green', 'green', 'green'], 3), manual), 5);
});

test('generated puzzles are self-consistent across 500 seeds', () => {
  for (let s = 0; s < 500; s++) {
    const p = circuit.generatePuzzle(createRng(s), manual);
    assert.deepEqual(p.secret, circuit.solve(p.view, manual));
    assert.ok(p.view.wires.length >= 4 && p.view.wires.length <= 6, `seed ${s} wire count`);
    assert.ok(p.view.voltage >= 1 && p.view.voltage <= 9);
    for (const w of p.view.wires) {
      assert.ok(['red', 'blue', 'yellow', 'green', 'white'].includes(w.color));
      assert.equal(w.cut, false);
    }
  }
});

test('wrong cut strikes, stays cut, and answer re-derives from remaining wires', () => {
  const p = circuit.generatePuzzle(createRng(5), manual);
  const wrong = (p.secret.cutIndex + 1) % p.view.wires.length;
  assert.deepEqual(circuit.validate(p, { wire: wrong }), { result: 'strike' });
  assert.equal(p.view.wires[wrong].cut, true);
  const remaining = p.view.wires.filter((w) => !w.cut);
  const expected = circuit.solve({ wires: remaining, voltage: p.view.voltage }, manual);
  assert.deepEqual(p.secret, expected);
});

test('correct cut solves', () => {
  const p = circuit.generatePuzzle(createRng(5), manual);
  const uncut = p.view.wires.map((_, i) => i).filter((i) => !p.view.wires[i].cut);
  assert.deepEqual(circuit.validate(p, { wire: uncut[p.secret.cutIndex] }), { result: 'solved' });
  assert.equal(p.view.wires[uncut[p.secret.cutIndex]].cut, true);
});

test('cutting an already-cut wire is ok (ignored), no strike', () => {
  const p = circuit.generatePuzzle(createRng(5), manual);
  const wrong = (p.secret.cutIndex + 1) % p.view.wires.length;
  circuit.validate(p, { wire: wrong });
  assert.deepEqual(circuit.validate(p, { wire: wrong }), { result: 'ok' });
});

test('out-of-range or malformed wire index is ok (ignored)', () => {
  const p = circuit.generatePuzzle(createRng(5), manual);
  assert.deepEqual(circuit.validate(p, { wire: 99 }), { result: 'ok' });
  assert.deepEqual(circuit.validate(p, { wire: -1 }), { result: 'ok' });
  assert.deepEqual(circuit.validate(p, { wire: 'x' }), { result: 'ok' });
  assert.deepEqual(circuit.validate(p, null), { result: 'ok' });
});

test('rule spread: no single rule answers more than 45% of 1000 puzzles', () => {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let s = 0; s < 1000; s++) {
    const p = circuit.generatePuzzle(createRng(s), manual);
    counts[circuit.whichRule(p.view, manual)]++;
  }
  const max = Math.max(...counts);
  assert.ok(max / 1000 < 0.45, `rule counts ${counts.slice(1).join(',')}`);
  for (let r = 1; r <= 5; r++) assert.ok(counts[r] > 0, `rule ${r} never fired`);
});

test('every reachable wrong-cut state stays solvable after 1 or 2 wrong cuts', () => {
  for (let s = 0; s < 300; s++) {
    const p = circuit.generatePuzzle(createRng(s), manual);
    const n = p.view.wires.length;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const q = structuredClone(p);
        if (circuit.validate(q, { wire: a }).result !== 'strike') continue;
        const r2 = circuit.validate(q, { wire: b }).result;
        if (r2 !== 'strike') continue;
        const remaining = q.view.wires.filter((w) => !w.cut);
        assert.ok(remaining.length >= 2);
        assert.ok(q.secret.cutIndex >= 0 && q.secret.cutIndex < remaining.length);
        assert.deepEqual(q.secret, circuit.solve({ wires: remaining, voltage: q.view.voltage }, manual));
      }
    }
  }
});
