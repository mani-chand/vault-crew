// Lookout: no page this minute. Big instruments, a job to do out loud.

import { h, clear, append } from '../dom.js';
import { renderInstruments, flashInstruments } from '../instruments.js';
import { mountShuffleCountdown } from '../timer.js';
import { onShuffleEvent } from './crew.js';

let subscribed = false;

function subscribe(actions) {
  if (subscribed) return;
  subscribed = true;
  actions.on('strike', () => flashInstruments('strike'));
  actions.on('moduleSolved', () => flashInstruments('solved'));
  actions.on('shuffle', onShuffleEvent);
}

export function render(root, state, actions) {
  subscribe(actions);
  clear(root);
  const pending = state.players.find((p) => p.playerId === state.you.playerId)?.pending;

  append(root, [
    renderInstruments(state, { large: true }),
    h('div', { class: 'panel' },
      h('h2', { class: 'page__title' }, "You're the Lookout"),
      h('p', {}, pending
        ? `You joined mid-round. You'll get a page from the next round. For now, call out the time and strikes for ${state.round.crackerName}.`
        : `No page this minute. Call out the time and strikes so ${state.round.crackerName} never has to look.`),
      state.round.shuffleEnabled && state.round.nextShuffleAt
        ? h('p', { class: 'hint' }, mountShuffleCountdown(h('span', { class: 'swapcount' }), { at: state.round.nextShuffleAt, warnMs: state.round.shuffleWarnMs }))
        : null,
    ),
  ]);
}
