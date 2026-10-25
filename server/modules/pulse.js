// Pulse: a lamp flashes four colours on repeat at a SLOW or FAST tempo. The
// manual has one "see → press" table per tempo. The Cracker presses the four
// mapped colours in order.

export const id = 'pulse';
export const name = 'Pulse';

export const COLORS = ['red', 'green', 'blue', 'yellow'];
export const TEMPOS = ['SLOW', 'FAST'];
const SEQUENCE_LENGTH = 4;

// A permutation of COLORS with no colour mapping to itself, so every row of
// the table is a real translation.
function derangement(rng) {
  for (;;) {
    const shuffled = rng.shuffle(COLORS);
    if (shuffled.every((c, i) => c !== COLORS[i])) {
      return Object.fromEntries(COLORS.map((c, i) => [c, shuffled[i]]));
    }
  }
}

function sameTable(a, b) {
  return COLORS.every((c) => a[c] === b[c]);
}

export function generateManual(rng) {
  const SLOW = derangement(rng);
  let FAST = derangement(rng);
  while (sameTable(SLOW, FAST)) FAST = derangement(rng);
  return { tables: { SLOW, FAST } };
}

export function solve(view, manual) {
  const table = manual.tables[view.tempo];
  return { presses: view.sequence.map((c) => table[c]) };
}

export function generatePuzzle(rng, manual) {
  const sequence = [];
  for (let i = 0; i < SEQUENCE_LENGTH; i++) sequence.push(rng.pick(COLORS));
  const view = { sequence, tempo: rng.pick(TEMPOS), progress: 0 };
  return { view, progress: {}, secret: solve(view, manual) };
}

export function validate(puzzle, action) {
  const { view, secret } = puzzle;
  const color = action && typeof action.color === 'string' ? action.color : null;
  if (!COLORS.includes(color)) return { result: 'ok' };

  if (color !== secret.presses[view.progress]) {
    view.progress = 0;
    return { result: 'strike' };
  }
  view.progress += 1;
  return { result: view.progress === SEQUENCE_LENGTH ? 'solved' : 'ok' };
}
