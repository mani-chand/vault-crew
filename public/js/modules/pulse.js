// Pulse controls: one lamp flashing a looping sequence, four colour buttons.
// The flash phase is computed from the clock so re-renders never restart it.

import { h, append } from '../dom.js';

export const title = 'Pulse';

const FLASH_MS = { SLOW: 700, FAST: 350 };
const GAP_MS = 1200;
const COLORS = ['red', 'green', 'blue', 'yellow'];

let ticker = null;
let origin = Date.now();
let originKey = null;

function phase(sequence, tempo) {
  const flash = FLASH_MS[tempo];
  const period = sequence.length * flash + GAP_MS;
  const t = (Date.now() - origin) % period;
  const idx = Math.floor(t / flash);
  if (idx >= sequence.length) return null;
  // Short dark gap inside each flash so repeated colours read as separate.
  if (t % flash > flash * 0.8) return null;
  return sequence[idx];
}

function tick() {
  const lamp = document.querySelector('[data-pulse-lamp]');
  if (!lamp) {
    clearInterval(ticker);
    ticker = null;
    return;
  }
  const sequence = lamp.dataset.sequence.split(',');
  const color = phase(sequence, lamp.dataset.tempo);
  lamp.className = `pulse__lamp${color ? ` pulse__lamp--${color}` : ''}`;
  lamp.querySelector('.pulse__word').textContent = color || '';
}

export function render(root, m, { send }) {
  const key = `${m.sequence.join(',')}:${m.tempo}`;
  if (key !== originKey) {
    originKey = key;
    origin = Date.now();
  }
  const disabled = m.status === 'solved';
  const lamp = h('div', {
    class: 'pulse__lamp',
    dataset: { pulseLamp: '1', sequence: m.sequence.join(','), tempo: m.tempo },
    'aria-label': 'Flashing lamp',
  }, h('span', { class: 'pulse__word' }));
  if (!ticker) ticker = setInterval(tick, 40);

  append(root, [
    h('div', { class: 'pulse' },
      lamp,
      h('p', { class: 'pulse__tempo' }, `Tempo: ${m.tempo.toLowerCase()} · 4 flashes, then a pause`),
    ),
    h('p', { class: 'hint' }, `${m.progress} of 4 pressed. Press the colours in order.`),
    h('div', { class: 'pulse__buttons' },
      COLORS.map((c) =>
        h('button', {
          class: `swatch swatch--${c}`,
          type: 'button',
          disabled,
          onClick: () => send({ color: c }),
        }, h('span', { class: 'swatch__dot' }), h('span', {}, c)),
      ),
    ),
  ]);
}
