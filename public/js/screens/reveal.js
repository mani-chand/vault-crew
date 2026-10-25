// Placeholder until the reveal screen is built.
import { h, clear } from '../dom.js';

export function render(root, state) {
  clear(root);
  root.append(h('p', { class: 'placeholder' }, `Reveal — you are ${state.you.role}`));
}
