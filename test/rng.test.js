import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/rng.js';

test('same seed gives same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

test('different seeds give different sequences', () => {
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('next is in [0, 1)', () => {
  const r = createRng(9);
  for (let i = 0; i < 1000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
  }
});

test('int is inclusive of both bounds over many draws', () => {
  const r = createRng(1);
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(r.int(1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('pick returns an element of the array', () => {
  const arr = ['a', 'b', 'c'];
  const r = createRng(5);
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(r.pick(arr)));
});

test('shuffle returns a new permutation and leaves the input untouched', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = createRng(3).shuffle(input);
  assert.notEqual(out, input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
});

test('sample returns n distinct elements', () => {
  const s = createRng(7).sample([1, 2, 3, 4, 5, 6], 4);
  assert.equal(s.length, 4);
  assert.equal(new Set(s).size, 4);
  for (const v of s) assert.ok([1, 2, 3, 4, 5, 6].includes(v));
});
