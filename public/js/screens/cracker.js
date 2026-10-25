// Cracker: the instrument bar, four module tiles, and one module open at a
// time full-screen. Local UI state (which module is open) survives the
// re-render that follows every server snapshot.

import { h, clear, append } from '../dom.js';
import { renderInstruments, flashInstruments, MODULE_NAMES, MODULE_ORDER } from '../instruments.js';
import * as circuit from '../modules/circuit.js';
import * as tumbler from '../modules/tumbler.js';
import * as glyphpad from '../modules/glyphpad.js';
import * as pulse from '../modules/pulse.js';
import { createInflightGate } from '../inflight.js';

const MODULE_UI = { circuit, tumbler, glyphpad, pulse };
const AUTO_CLOSE_MS = 900;

let openModule = null;
let roundKey = null;
let subscribed = false;
let bannerTimer = null;
const gates = { circuit: createInflightGate(), tumbler: createInflightGate(), glyphpad: createInflightGate(), pulse: createInflightGate() };

function subscribe(actions) {
  if (subscribed) return;
  subscribed = true;
  actions.on('strike', () => flashInstruments('strike'));
  actions.on('moduleSolved', () => flashInstruments('solved'));
  actions.on('shuffle', () => {
    const banner = document.getElementById('cracker-banner');
    if (!banner) return;
    banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.hidden = true; }, 2000);
  });
}

export function render(root, state, actions) {
  subscribe(actions);
  const key = `${state.code}:${state.round.roundIndex}`;
  if (key !== roundKey) {
    roundKey = key;
    openModule = null;
  }
  clear(root);
  // A fresh snapshot carries the new seq, so every gate opens again.
  for (const gate of Object.values(gates)) gate.release();

  const modules = state.cracker.modules;
  const rerender = () => render(root, state, actions);
  const banner = h('p', { class: 'banner banner--teal', id: 'cracker-banner', hidden: true }, 'Crew pages shuffled');

  if (openModule && modules[openModule]) {
    const id = openModule;
    const m = modules[id];
    if (m.status === 'solved') setTimeout(() => { if (openModule === id) { openModule = null; rerender(); } }, AUTO_CLOSE_MS);
    const panel = h('div', { class: `module module--${id}${m.status === 'solved' ? ' module--solved' : ''}` });
    const gate = gates[id];
    const send = async (action) => {
      if (gate.locked) return { ok: false, error: 'busy' };
      gate.lock();
      panel.classList.add('module--busy');
      const res = await actions.call('module:action', { moduleId: id, seq: m.seq, action });
      if (gate.settle(res) === 'unlocked') panel.classList.remove('module--busy');
      return res;
    };
    MODULE_UI[id].render(panel, m, { send });
    append(root, [
      renderInstruments(state),
      banner,
      h('div', { class: 'module__head' },
        h('button', { class: 'button button--quiet module__back', type: 'button', onClick: () => { openModule = null; rerender(); } }, '‹ All modules'),
        h('h2', { class: 'module__title' }, MODULE_NAMES[id]),
        m.status === 'solved' ? h('span', { class: 'tag tag--solved' }, 'Solved') : null,
      ),
      panel,
    ]);
    return;
  }

  append(root, [
    renderInstruments(state),
    banner,
    h('p', { class: 'hint' }, 'Open a module and describe what you see.'),
    h('div', { class: 'tiles' },
      MODULE_ORDER.map((id) => {
        const solved = modules[id].status === 'solved';
        return h('button', {
          class: `tile tile--${id}${solved ? ' tile--solved' : ''}`,
          type: 'button',
          disabled: solved,
          onClick: () => { openModule = id; rerender(); },
        },
        h('span', { class: 'tile__name' }, MODULE_NAMES[id]),
        h('span', { class: 'tile__state' }, solved ? 'Solved' : 'Open'),
        );
      }),
    ),
  ]);
}
