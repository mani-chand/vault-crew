// Tumbler controls: three glyphs, a lamp, a 0–19 dial, commit with a turn.

import { h, append } from '../dom.js';
import { glyphSvg, glyphName } from '../glyph.js';

export const title = 'Tumbler';
const DIAL_SIZE = 20;

let dial = 0;
let dialKey = null;

export function render(root, m, { send }) {
  const key = m.glyphs.join(',');
  if (key !== dialKey) {
    dialKey = key;
    dial = 0;
  }
  const disabled = m.status === 'solved';
  const number = h('div', { class: 'dial__number', 'aria-live': 'polite' }, String(dial));
  const pointer = h('div', { class: 'dial__pointer', style: { transform: `rotate(${dial * (360 / DIAL_SIZE)}deg)` } });

  const setDial = (n) => {
    dial = (n + DIAL_SIZE) % DIAL_SIZE;
    number.textContent = String(dial);
    pointer.style.transform = `rotate(${dial * (360 / DIAL_SIZE)}deg)`;
  };

  append(root, [
    h('div', { class: 'glyphrow' },
      m.glyphs.map((id) =>
        h('div', { class: 'glyphrow__item' }, glyphSvg(id, 44), h('span', { class: 'glyphrow__name' }, glyphName(id))),
      ),
    ),
    h('div', { class: `lamp lamp--${m.lamp}` },
      h('span', { class: 'lamp__dot' }),
      h('span', {}, `Arrow lamp: ${m.lamp}`),
    ),
    h('p', { class: 'hint' }, `Step ${Math.min(m.step + 1, 3)} of 3. Set the number, then turn.`),
    h('div', { class: 'dial' },
      h('button', { class: 'dial__btn', type: 'button', disabled, 'aria-label': 'Lower number', onClick: () => setDial(dial - 1) }, '−'),
      h('div', { class: 'dial__face' },
        h('div', { class: 'dial__ticks' }),
        pointer,
        number,
      ),
      h('button', { class: 'dial__btn', type: 'button', disabled, 'aria-label': 'Raise number', onClick: () => setDial(dial + 1) }, '+'),
    ),
    h('div', { class: 'turns' },
      h('button', { class: 'button', type: 'button', disabled, onClick: () => send({ number: dial, dir: 'L' }) }, '↺ Turn left'),
      h('button', { class: 'button', type: 'button', disabled, onClick: () => send({ number: dial, dir: 'R' }) }, 'Turn right ↻'),
    ),
  ]);
}
