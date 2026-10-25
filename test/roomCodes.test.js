import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/rng.js';
import { CODE_ALPHABET, generateCode, normalizeCode } from '../server/roomCodes.js';

test('alphabet has no I, O, or digits', () => {
  assert.equal(CODE_ALPHABET, 'ABCDEFGHJKLMNPQRSTUVWXYZ');
});

test('code is 4 letters from alphabet without I or O', () => {
  const code = generateCode(createRng(3), new Set());
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
});

test('generateCode avoids taken codes', () => {
  const first = generateCode(createRng(3), new Set());
  const second = generateCode(createRng(3), new Set([first]));
  assert.notEqual(second, first);
  assert.match(second, /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
});

test('normalizeCode trims and uppercases', () => {
  assert.equal(normalizeCode(' abcd '), 'ABCD');
});

test('normalizeCode tolerates non-string input', () => {
  assert.equal(normalizeCode(undefined), '');
  assert.equal(normalizeCode(null), '');
  assert.equal(normalizeCode(1234), '1234');
});
