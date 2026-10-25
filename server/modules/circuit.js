// Circuit Bank: 4–6 coloured wires and a voltage readout. The Cracker cuts one
// wire. The manual is a fixed, ordered rule list; the first matching rule wins.
// After a wrong cut the rules are re-applied to the wires that remain.

export const id = 'circuit';
export const name = 'Circuit Bank';

export const COLORS = ['red', 'blue', 'yellow', 'green', 'white'];
const MIN_WIRES = 4;
const MAX_WIRES = 6;
const RULE_COUNT = 5;

const RULES = [
  'If there are no red wires, cut the 2nd wire.',
  'Otherwise, if the voltage is even and there is a blue wire, cut the last blue wire.',
  'Otherwise, if there is more than one yellow wire, cut the first yellow wire.',
  'Otherwise, if there is exactly one white wire, cut the wire directly below it. If the white wire is last, cut the 1st wire.',
  'Otherwise, cut wire number (voltage ÷ wire count, remainder). If the remainder is 0, cut the last wire.',
];

export function generateManual() {
  return { rules: RULES.slice() };
}

function uncut(view) {
  return view.wires.filter((w) => !w.cut);
}

// Returns which rule (1–5) applies to the uncut wires of `view`.
export function whichRule(view) {
  const wires = uncut(view);
  const colors = wires.map((w) => w.color);
  if (!colors.includes('red')) return 1;
  if (view.voltage % 2 === 0 && colors.includes('blue')) return 2;
  if (colors.filter((c) => c === 'yellow').length > 1) return 3;
  if (colors.filter((c) => c === 'white').length === 1) return 4;
  return 5;
}

// Index into the *uncut* wires of the wire to cut.
export function solve(view) {
  const colors = uncut(view).map((w) => w.color);
  const k = colors.length;
  switch (whichRule(view)) {
    case 1:
      return { cutIndex: 1 };
    case 2:
      return { cutIndex: colors.lastIndexOf('blue') };
    case 3:
      return { cutIndex: colors.indexOf('yellow') };
    case 4: {
      const w = colors.indexOf('white');
      return { cutIndex: w === k - 1 ? 0 : w + 1 };
    }
    default: {
      const r = view.voltage % k;
      return { cutIndex: r === 0 ? k - 1 : r - 1 };
    }
  }
}

function randomView(rng) {
  const n = rng.int(MIN_WIRES, MAX_WIRES);
  const wires = [];
  for (let i = 0; i < n; i++) wires.push({ color: rng.pick(COLORS), cut: false });
  return { wires, voltage: rng.int(1, 9) };
}

// Picks a target rule first, then samples views until that rule fires, so the
// five rules come up about equally often instead of "no red" dominating.
export function generatePuzzle(rng, manual) {
  const target = rng.int(1, RULE_COUNT);
  let view = randomView(rng);
  for (let tries = 0; tries < 200 && whichRule(view) !== target; tries++) view = randomView(rng);
  return { view, progress: {}, secret: solve(view, manual) };
}

export function validate(puzzle, action) {
  const { view } = puzzle;
  const i = action && Number.isInteger(action.wire) ? action.wire : -1;
  if (i < 0 || i >= view.wires.length || view.wires[i].cut) return { result: 'ok' };

  const uncutIndices = view.wires.map((_, idx) => idx).filter((idx) => !view.wires[idx].cut);
  const target = uncutIndices[puzzle.secret.cutIndex];
  view.wires[i].cut = true;
  if (i === target) return { result: 'solved' };

  puzzle.secret = solve(view);
  return { result: 'strike' };
}
