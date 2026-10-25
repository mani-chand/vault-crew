// Crew: instrument bar, the pages you hold (tabs when more than one), and
// the swap countdown. No module controls, no puzzle state.

import { h, clear, append } from '../dom.js';
import { renderInstruments, flashInstruments, MODULE_ORDER } from '../instruments.js';
import { renderManual } from '../manual.js';
import { mountShuffleCountdown } from '../timer.js';
import { createShuffleTracker } from '../shuffleTracker.js';

let activeTab = null;
let subscribed = false;
let flashTimer = null;
const shuffles = createShuffleTracker();

export function showSwapFlash() {
  const flash = document.getElementById('swap-flash');
  if (!flash) return;
  flash.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flash.hidden = true; }, 1000);
}

// Shared by the crew and lookout screens so a shuffle flashes exactly once
// whichever screen is showing.
export function onShuffleEvent(e) {
  if (shuffles.isNew(e.shuffleId)) showSwapFlash();
}

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
  const pages = (state.crew ? state.crew.pages : []).slice()
    .sort((a, b) => MODULE_ORDER.indexOf(a.moduleId) - MODULE_ORDER.indexOf(b.moduleId));
  if (!pages.some((p) => p.moduleId === activeTab)) activeTab = pages.length ? pages[0].moduleId : null;

  const rerender = () => render(root, state, actions);
  const current = pages.find((p) => p.moduleId === activeTab);

  append(root, [
    renderInstruments(state),
    h('div', { class: 'crewline' },
      h('span', {}, `${state.round.crackerName} is cracking. Tell them what to do.`),
      state.round.shuffleEnabled && state.round.nextShuffleAt
        ? mountShuffleCountdown(h('span', { class: 'swapcount' }), { at: state.round.nextShuffleAt, warnMs: state.round.shuffleWarnMs })
        : null,
    ),
    pages.length > 1
      ? h('div', { class: 'tabs', role: 'tablist' },
        pages.map((p) =>
          h('button', {
            class: `tabs__tab${p.moduleId === activeTab ? ' tabs__tab--active' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': p.moduleId === activeTab ? 'true' : 'false',
            onClick: () => { activeTab = p.moduleId; rerender(); },
          }, p.name),
        ),
      )
      : null,
    current
      ? h('div', { class: 'panel panel--teal page' },
        h('h2', { class: 'page__title' }, current.name),
        renderManual(current.moduleId, current.manual),
      )
      : h('p', { class: 'hint' }, 'No page right now.'),
  ]);
}
