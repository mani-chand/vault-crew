// Placeholder until the crew screen is built.
import { h, clear } from '../dom.js';

export function render(root) {
  clear(root);
  root.append(h('p', { class: 'placeholder' }, 'Crew screen'));
}
