// Tumbler: a combination dial. The view shows three glyphs and a lamp colour.
// The manual maps each glyph to a dial number and gives a direction pattern per
// lamp colour. The Cracker dials the three numbers in order; any slip resets
// the sequence to the start.

import { GLYPH_IDS } from '../../shared/glyphs.js';

export const id = 'tumbler';
export const name = 'Tumbler';

const TABLE_SIZE = 8;
const SEQUENCE_LENGTH = 3;
const DIAL_SIZE = 20;
const DIAL_NUMBERS = Array.from({ length: DIAL_SIZE }, (_, i) => i);

export function generateManual(rng) {
  const glyphs = rng.sample(GLYPH_IDS, TABLE_SIZE);
  const numbers = rng.sample(DIAL_NUMBERS, TABLE_SIZE);
  return {
    table: glyphs.map((glyph, i) => ({ glyph, number: numbers[i] })),
    directionRule: { green: ['L', 'R', 'L'], red: ['R', 'L', 'R'] },
  };
}

export function solve(view, manual) {
  const dirs = manual.directionRule[view.lamp];
  const sequence = view.glyphs.map((glyph, i) => ({
    number: manual.table.find((row) => row.glyph === glyph).number,
    dir: dirs[i],
  }));
  return { sequence };
}

export function generatePuzzle(rng, manual) {
  const glyphs = rng.sample(manual.table.map((row) => row.glyph), SEQUENCE_LENGTH);
  const view = { glyphs, lamp: rng.pick(['green', 'red']), step: 0 };
  return { view, progress: {}, secret: solve(view, manual) };
}

export function validate(puzzle, action) {
  const { view } = puzzle;
  const valid =
    action &&
    Number.isInteger(action.number) &&
    action.number >= 0 &&
    action.number < DIAL_SIZE &&
    (action.dir === 'L' || action.dir === 'R');
  if (!valid) return { result: 'ok' };

  const expected = puzzle.secret.sequence[view.step];
  if (action.number !== expected.number || action.dir !== expected.dir) {
    view.step = 0;
    return { result: 'strike' };
  }
  view.step++;
  return { result: view.step >= SEQUENCE_LENGTH ? 'solved' : 'ok' };
}
