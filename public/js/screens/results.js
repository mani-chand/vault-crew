// Placeholder until the result screens are built.
import { h, clear } from '../dom.js';

export function renderRoundResult(root, state) {
  clear(root);
  root.append(h('p', { class: 'placeholder' }, `Round result: ${state.round ? state.round.result : ''}`));
}

export function renderFinal(root) {
  clear(root);
  root.append(h('p', { class: 'placeholder' }, 'Final screen'));
}
