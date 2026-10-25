// Placeholder until the cracker screen is built.
import { h, clear } from '../dom.js';

export function render(root) {
  clear(root);
  root.append(h('p', { class: 'placeholder' }, 'Cracker screen'));
}
