// Registry of the four vault modules. Manuals are generated once per match,
// puzzles once per round against those manuals.

import * as circuit from './circuit.js';
import * as tumbler from './tumbler.js';
import * as glyphpad from './glyphpad.js';
import * as pulse from './pulse.js';

export const MODULE_IDS = Object.freeze(['circuit', 'tumbler', 'glyphpad', 'pulse']);

export const MODULES = Object.freeze({ circuit, tumbler, glyphpad, pulse });

export function generateManuals(rng) {
  const manuals = {};
  for (const id of MODULE_IDS) manuals[id] = MODULES[id].generateManual(rng);
  return manuals;
}

export function generatePuzzles(rng, manuals) {
  const puzzles = {};
  for (const id of MODULE_IDS) puzzles[id] = MODULES[id].generatePuzzle(rng, manuals[id]);
  return puzzles;
}
