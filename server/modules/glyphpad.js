// Glyph Pad: a 3×3 keypad of nine symbols, four of them ringed, and a lamp.
// The Cracker presses the ringed glyphs in the order the manual's 4×4 grid
// lists them (row-major). An amber lamp reverses that order. A wrong press
// clears all progress.

import { GLYPH_IDS } from '../../shared/glyphs.js';

export const id = 'glyphpad';
export const name = 'Glyph Pad';

const PAD_SIZE = 9;
const RING_COUNT = 4;
const LAMPS = ['white', 'amber'];

export function generateManual(rng) {
  return { grid: rng.shuffle(GLYPH_IDS) };
}

// The ringed glyphs sorted by their position in the manual grid, reversed if amber.
export function solve(view, manual) {
  const order = view.ringed
    .slice()
    .sort((a, b) => manual.grid.indexOf(a) - manual.grid.indexOf(b));
  if (view.lamp === 'amber') order.reverse();
  return { order };
}

export function generatePuzzle(rng, manual) {
  const pad = rng.sample(GLYPH_IDS, PAD_SIZE);
  // Filtering the pad keeps the ringed glyphs in pad order.
  const ringSet = new Set(rng.sample(pad, RING_COUNT));
  const ringed = pad.filter((g) => ringSet.has(g));
  const view = { pad, ringed, lamp: rng.pick(LAMPS), pressed: [] };
  return { view, progress: {}, secret: solve(view, manual) };
}

export function validate(puzzle, action) {
  const { view, secret } = puzzle;
  if (!action || typeof action.glyph !== 'string') return { result: 'ok' };

  if (action.glyph !== secret.order[view.pressed.length]) {
    view.pressed = [];
    return { result: 'strike' };
  }
  view.pressed.push(action.glyph);
  return { result: view.pressed.length === secret.order.length ? 'solved' : 'ok' };
}
