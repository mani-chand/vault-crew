import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../server/rng.js';
import * as tumbler from '../../server/modules/tumbler.js';
import { GLYPH_IDS } from '../../shared/glyphs.js';

const manual = tumbler.generateManual(createRng(1));

const literalManual = {
  table: [
    { glyph: 'star', number: 4 },
    { glyph: 'moon', number: 17 },
    { glyph: 'key', number: 0 },
    { glyph: 'eye', number: 9 },
    { glyph: 'bolt', number: 12 },
    { glyph: 'wave', number: 19 },
    { glyph: 'heart', number: 7 },
    { glyph: 'anchor', number: 15 },
  ],
  directionRule: { green: ['L', 'R', 'L'], red: ['R', 'L', 'R'] },
};

// Fresh puzzle plus the exact actions that solve it.
const fresh = () => {
  const p = tumbler.generatePuzzle(createRng(7), manual);
  return { p, seq: p.secret.sequence };
};

test('module id and name', () => {
  assert.equal(tumbler.id, 'tumbler');
  assert.equal(tumbler.name, 'Tumbler');
});

test('manual has 8 distinct glyphs mapped to 8 distinct numbers in 0..19', () => {
  assert.equal(manual.table.length, 8);
  assert.equal(new Set(manual.table.map((r) => r.glyph)).size, 8);
  assert.equal(new Set(manual.table.map((r) => r.number)).size, 8);
  for (const r of manual.table) {
    assert.ok(GLYPH_IDS.includes(r.glyph));
    assert.ok(Number.isInteger(r.number) && r.number >= 0 && r.number <= 19);
  }
  assert.deepEqual(manual.directionRule, { green: ['L', 'R', 'L'], red: ['R', 'L', 'R'] });
});

test('solve maps glyphs through table and applies lamp direction', () => {
  const glyphs = ['moon', 'key', 'star'];
  assert.deepEqual(tumbler.solve({ glyphs, lamp: 'red', step: 0 }, literalManual).sequence, [
    { number: 17, dir: 'R' },
    { number: 0, dir: 'L' },
    { number: 4, dir: 'R' },
  ]);
  assert.deepEqual(tumbler.solve({ glyphs, lamp: 'green', step: 0 }, literalManual).sequence, [
    { number: 17, dir: 'L' },
    { number: 0, dir: 'R' },
    { number: 4, dir: 'L' },
  ]);
});

test('generated puzzles are self-consistent across 500 seeds', () => {
  for (let s = 0; s < 500; s++) {
    const m = tumbler.generateManual(createRng(s));
    const p = tumbler.generatePuzzle(createRng(s + 1000), m);
    assert.deepEqual(p.secret, tumbler.solve(p.view, m));
    assert.equal(p.view.glyphs.length, 3);
    assert.equal(new Set(p.view.glyphs).size, 3);
    const tableGlyphs = m.table.map((r) => r.glyph);
    for (const g of p.view.glyphs) assert.ok(tableGlyphs.includes(g), `seed ${s} glyph`);
    assert.ok(['green', 'red'].includes(p.view.lamp));
    assert.equal(p.view.step, 0);
    assert.deepEqual(p.progress, {});
  }
});

test('three correct commits solve, step advances in view', () => {
  const { p, seq } = fresh();
  assert.deepEqual(tumbler.validate(p, seq[0]), { result: 'ok' });
  assert.equal(p.view.step, 1);
  assert.deepEqual(tumbler.validate(p, seq[1]), { result: 'ok' });
  assert.equal(p.view.step, 2);
  assert.deepEqual(tumbler.validate(p, seq[2]), { result: 'solved' });
});

test('wrong number strikes and resets step to 0', () => {
  const { p, seq } = fresh();
  tumbler.validate(p, seq[0]);
  tumbler.validate(p, seq[1]);
  assert.equal(p.view.step, 2);
  const wrong = { number: (seq[2].number + 1) % 20, dir: seq[2].dir };
  assert.deepEqual(tumbler.validate(p, wrong), { result: 'strike' });
  assert.equal(p.view.step, 0);
});

test('right number wrong direction strikes', () => {
  const { p, seq } = fresh();
  const flipped = { number: seq[0].number, dir: seq[0].dir === 'L' ? 'R' : 'L' };
  assert.deepEqual(tumbler.validate(p, flipped), { result: 'strike' });
  assert.equal(p.view.step, 0);
});

test('malformed actions are ok and do not change step', () => {
  const { p, seq } = fresh();
  tumbler.validate(p, seq[0]);
  const bad = [
    null,
    undefined,
    {},
    { number: 1.5, dir: 'L' },
    { number: '3', dir: 'L' },
    { number: -1, dir: 'L' },
    { number: 20, dir: 'L' },
    { number: 3, dir: 'X' },
    { number: 3 },
  ];
  for (const a of bad) {
    assert.deepEqual(tumbler.validate(p, a), { result: 'ok' });
    assert.equal(p.view.step, 1);
  }
});
