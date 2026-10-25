import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../server/rng.js';
import * as glyphpad from '../../server/modules/glyphpad.js';
import { GLYPH_IDS } from '../../shared/glyphs.js';

const identity = { grid: [...GLYPH_IDS] };

// A fresh puzzle with a known ringed set, so presses are easy to script.
const makePuzzle = (lamp = 'white') => {
  const view = {
    pad: ['triangle', 'square', 'circle', 'diamond', 'star', 'hexagon', 'cross', 'arrow', 'key'],
    ringed: ['triangle', 'circle', 'star', 'key'],
    lamp,
    pressed: [],
  };
  return { view, progress: {}, secret: glyphpad.solve(view, identity) };
};

test('module id and name', () => {
  assert.equal(glyphpad.id, 'glyphpad');
  assert.equal(glyphpad.name, 'Glyph Pad');
});

test('manual grid is a permutation of all 16 glyphs', () => {
  const manual = glyphpad.generateManual(createRng(1));
  assert.equal(manual.grid.length, 16);
  assert.equal(new Set(manual.grid).size, 16);
  for (const g of manual.grid) assert.ok(GLYPH_IDS.includes(g));
});

test('solve orders ringed glyphs by grid position; amber reverses', () => {
  const ringed = ['key', 'circle', 'star', 'triangle'];
  const pad = [...ringed, 'square', 'diamond', 'hexagon', 'cross', 'arrow'];
  assert.deepEqual(
    glyphpad.solve({ pad, ringed, lamp: 'white', pressed: [] }, identity).order,
    ['triangle', 'circle', 'star', 'key'],
  );
  assert.deepEqual(
    glyphpad.solve({ pad, ringed, lamp: 'amber', pressed: [] }, identity).order,
    ['key', 'star', 'circle', 'triangle'],
  );
});

test('generated puzzles are self-consistent across 500 seeds', () => {
  for (let s = 0; s < 500; s++) {
    const manual = glyphpad.generateManual(createRng(s));
    const p = glyphpad.generatePuzzle(createRng(s + 1000), manual);
    assert.deepEqual(p.secret, glyphpad.solve(p.view, manual));
    assert.equal(p.view.pad.length, 9);
    assert.equal(new Set(p.view.pad).size, 9);
    for (const g of p.view.pad) assert.ok(GLYPH_IDS.includes(g));
    assert.equal(p.view.ringed.length, 4);
    assert.equal(new Set(p.view.ringed).size, 4);
    for (const g of p.view.ringed) assert.ok(p.view.pad.includes(g), `seed ${s} ringed not on pad`);
    const padOrder = p.view.ringed.map((g) => p.view.pad.indexOf(g));
    assert.deepEqual(padOrder, [...padOrder].sort((a, b) => a - b), `seed ${s} ringed not in pad order`);
    assert.ok(['white', 'amber'].includes(p.view.lamp));
    assert.deepEqual(p.view.pressed, []);
  }
});

test('pressing in order: ok, ok, ok, solved', () => {
  const p = makePuzzle();
  const [a, b, c, d] = p.secret.order;
  assert.deepEqual(glyphpad.validate(p, { glyph: a }), { result: 'ok' });
  assert.equal(p.view.pressed.length, 1);
  assert.deepEqual(glyphpad.validate(p, { glyph: b }), { result: 'ok' });
  assert.equal(p.view.pressed.length, 2);
  assert.deepEqual(glyphpad.validate(p, { glyph: c }), { result: 'ok' });
  assert.equal(p.view.pressed.length, 3);
  assert.deepEqual(glyphpad.validate(p, { glyph: d }), { result: 'solved' });
});

test('wrong press strikes and clears pressed', () => {
  const p = makePuzzle();
  const [a, b, , d] = p.secret.order;
  glyphpad.validate(p, { glyph: a });
  glyphpad.validate(p, { glyph: b });
  assert.deepEqual(glyphpad.validate(p, { glyph: d }), { result: 'strike' });
  assert.deepEqual(p.view.pressed, []);
});

test('repeating an earlier correct press strikes', () => {
  const p = makePuzzle();
  glyphpad.validate(p, { glyph: p.secret.order[0] });
  assert.deepEqual(glyphpad.validate(p, { glyph: p.secret.order[0] }), { result: 'strike' });
  assert.deepEqual(p.view.pressed, []);
});

test('pressing an unringed pad glyph strikes', () => {
  const p = makePuzzle();
  assert.deepEqual(glyphpad.validate(p, { glyph: 'square' }), { result: 'strike' });
  assert.deepEqual(p.view.pressed, []);
});

test('malformed action is ok and leaves pressed unchanged', () => {
  const p = makePuzzle();
  glyphpad.validate(p, { glyph: p.secret.order[0] });
  assert.deepEqual(glyphpad.validate(p, null), { result: 'ok' });
  assert.deepEqual(glyphpad.validate(p, { glyph: 5 }), { result: 'ok' });
  assert.deepEqual(glyphpad.validate(p, {}), { result: 'ok' });
  assert.deepEqual(p.view.pressed, [p.secret.order[0]]);
});
