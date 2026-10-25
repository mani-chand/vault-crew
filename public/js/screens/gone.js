// Shown when the saved seat no longer exists: server restarted, room expired,
// or the session was rejected. Honest about it, one tap to carry on.

import { h, clear, append } from '../dom.js';

export function render(root, _state, actions) {
  clear(root);
  append(root, [
    h('div', { class: 'stack' },
      h('h1', {}, 'That room is gone'),
      h('p', { class: 'hint' }, 'The vault server restarted or the room expired, so its seats were lost. Create a new room and share the new code.'),
    ),
    h('div', { class: 'spacer' }),
    h('button', { class: 'button button--primary', type: 'button', onClick: actions.backToJoin }, 'Create a new room'),
  ]);
}
