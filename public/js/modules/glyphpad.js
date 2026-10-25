// Glyph Pad controls: a 3×3 pad, four glyphs ringed, press in order.

import { h, append } from '../dom.js';
import { glyphSvg, glyphName } from '../glyph.js';

export const title = 'Glyph Pad';

export function render(root, m, { send }) {
  const ringed = new Set(m.ringed);
  const pressed = new Set(m.pressed);
  const disabled = m.status === 'solved';
  append(root, [
    h('div', { class: `lamp lamp--${m.lamp}` },
      h('span', { class: 'lamp__dot' }),
      h('span', {}, `Lock lamp: ${m.lamp}`),
    ),
    h('p', { class: 'hint' }, `${m.pressed.length} of 4 pressed. Ringed glyphs are the ones that matter.`),
    h('div', { class: 'pad' },
      m.pad.map((id) =>
        h('button', {
          class: `pad__key${ringed.has(id) ? ' pad__key--ringed' : ''}${pressed.has(id) ? ' pad__key--pressed' : ''}`,
          type: 'button',
          disabled,
          'aria-label': `${glyphName(id)}${ringed.has(id) ? ', ringed' : ''}${pressed.has(id) ? ', pressed' : ''}`,
          onClick: () => send({ glyph: id }),
        },
        glyphSvg(id, 40),
        h('span', { class: 'pad__name' }, glyphName(id)),
        ),
      ),
    ),
  ]);
}
