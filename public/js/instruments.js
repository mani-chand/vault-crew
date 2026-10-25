// The instrument bar every in-game screen shares: timer, strikes, module
// status. Same layout for Cracker, Crew and Lookout so anyone at the table
// can read anyone's phone from across it.

import { h } from './dom.js';
import { mountTimer, freezeTimer } from './timer.js';

export const MODULE_NAMES = { circuit: 'Circuit Bank', tumbler: 'Tumbler', glyphpad: 'Glyph Pad', pulse: 'Pulse' };
export const MODULE_ORDER = ['circuit', 'tumbler', 'glyphpad', 'pulse'];

export function renderInstruments(state, { large = false } = {}) {
  const { round } = state;
  const timer = h('div', { class: 'timer', 'aria-live': 'off', 'aria-label': 'Time left' });
  if (round.result) freezeTimer(timer, round.endsAt && round.resultAt ? Math.max(0, round.endsAt - round.resultAt) : 0);
  else mountTimer(timer, { endsAt: round.startedAt ? round.endsAt : null, durationMs: round.durationMs });

  const strikes = h('div', { class: 'strikes', 'aria-label': `Strikes ${round.strikes} of ${round.strikesMax}` },
    h('div', { class: 'strikes__slots' },
      Array.from({ length: round.strikesMax }, (_, i) =>
        h('span', { class: `strikes__slot${i < round.strikes ? ' strikes__slot--hit' : ''}` }),
      ),
    ),
    h('span', { class: 'strikes__label' }, `Strikes ${round.strikes}/${round.strikesMax}`),
  );

  const modules = h('ul', { class: 'modstatus', 'aria-label': 'Modules' },
    MODULE_ORDER.map((id) =>
      h('li', { class: `modstatus__item${round.modules[id] === 'solved' ? ' modstatus__item--solved' : ''}`, dataset: { module: id } },
        h('span', { class: 'modstatus__dot' }),
        h('span', { class: 'modstatus__name' }, MODULE_NAMES[id]),
        h('span', { class: 'modstatus__state' }, round.modules[id] === 'solved' ? 'solved' : 'open'),
      ),
    ),
  );

  return h('div', { class: `instruments${large ? ' instruments--large' : ''}`, id: 'instruments' },
    h('div', { class: 'instruments__row' }, timer, strikes),
    modules,
  );
}

// Brief visual reactions to server events, applied to the mounted bar.
export function flashInstruments(kind) {
  const el = document.getElementById('instruments');
  if (!el) return;
  el.classList.remove('instruments--strike', 'instruments--solved');
  void el.offsetWidth;
  el.classList.add(`instruments--${kind}`);
  setTimeout(() => el.classList.remove(`instruments--${kind}`), 700);
}
