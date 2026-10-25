// Circuit Bank controls: numbered coloured wires, tap one to cut it.

import { h, append } from '../dom.js';

export const title = 'Circuit Bank';

export function render(root, m, { send }) {
  append(root, [
    h('div', { class: 'readout' },
      h('span', { class: 'readout__label' }, 'Voltage'),
      h('span', { class: 'readout__value' }, String(m.voltage)),
    ),
    h('p', { class: 'hint' }, `${m.wires.length} wires, top to bottom. Tap a wire to cut it.`),
    h('ol', { class: 'wires' },
      m.wires.map((w, i) =>
        h('li', {},
          h('button', {
            class: `wire wire--${w.color}${w.cut ? ' wire--cut' : ''}`,
            type: 'button',
            disabled: w.cut || m.status === 'solved',
            'aria-label': `Wire ${i + 1}, ${w.color}${w.cut ? ', cut' : ''}`,
            onClick: () => send({ wire: i }),
          },
          h('span', { class: 'wire__num' }, String(i + 1)),
          h('span', { class: 'wire__strand' }),
          h('span', { class: 'wire__color' }, w.cut ? `${w.color} (cut)` : w.color),
          ),
        ),
      ),
    ),
  ]);
}
