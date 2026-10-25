import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../server/rng.js';
import { MODULES, MODULE_IDS, generateManuals, generatePuzzles } from '../../server/modules/index.js';

test('registry lists the four modules in order', () => {
  assert.deepEqual(MODULE_IDS, ['circuit', 'tumbler', 'glyphpad', 'pulse']);
  for (const id of MODULE_IDS) {
    assert.equal(MODULES[id].id, id);
    assert.equal(typeof MODULES[id].name, 'string');
    for (const fn of ['generateManual', 'generatePuzzle', 'solve', 'validate']) {
      assert.equal(typeof MODULES[id][fn], 'function', `${id}.${fn}`);
    }
  }
});

test('generateManuals returns one manual per module id', () => {
  const manuals = generateManuals(createRng(1));
  assert.deepEqual(Object.keys(manuals), MODULE_IDS);
  assert.ok(manuals.tumbler.table);
  assert.ok(manuals.glyphpad.grid);
  assert.ok(manuals.pulse.tables);
  assert.ok(manuals.circuit.rules);
});

test('generatePuzzles returns a puzzle per id whose secret matches solve', () => {
  const manuals = generateManuals(createRng(1));
  for (let s = 0; s < 50; s++) {
    const puzzles = generatePuzzles(createRng(s), manuals);
    assert.deepEqual(Object.keys(puzzles), MODULE_IDS);
    for (const id of MODULE_IDS) {
      const p = puzzles[id];
      assert.ok(p.view && p.progress && p.secret, `${id} shape`);
      assert.deepEqual(p.secret, MODULES[id].solve(p.view, manuals[id]));
    }
  }
});

test('generateManuals is deterministic for a seed', () => {
  assert.deepEqual(generateManuals(createRng(9)), generateManuals(createRng(9)));
});
