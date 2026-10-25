// State store, screen router and event dispatcher. One section per screen;
// the server snapshot decides which one shows.

import { connect, call as rawCall, clearSession, serverNow } from './net.js';
import { sessionIsDead } from './session.js';
import { $ } from './dom.js';
import * as join from './screens/join.js';
import * as lobby from './screens/lobby.js';
import * as reveal from './screens/reveal.js';
import * as cracker from './screens/cracker.js';
import * as crew from './screens/crew.js';
import * as lookout from './screens/lookout.js';
import * as results from './screens/results.js';
import * as gone from './screens/gone.js';
import * as sound from './sound.js';

const SCREENS = {
  join,
  lobby,
  reveal,
  cracker,
  crew,
  lookout,
  roundResult: { render: results.renderRoundResult },
  final: { render: results.renderFinal },
  gone,
};

const WAKING_AFTER_MS = 1500;
const OFFLINE_DIM_AFTER_MS = 3000;
const RULES_SEEN_KEY = 'vcRulesSeen';

const store = { state: null, status: 'connecting', gone: null, current: null };
const handlers = new Map();

// Screens subscribe to server events ('strike', 'shuffle', …) or '*'.
export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
}

function dispatch(event) {
  for (const fn of handlers.get(event.type) || []) fn(event, store.state);
  for (const fn of handlers.get('*') || []) fn(event, store.state);
}

function screenFor() {
  if (store.gone) return 'gone';
  const s = store.state;
  if (!s) return 'join';
  switch (s.phase) {
    case 'lobby': return 'lobby';
    case 'reveal': return 'reveal';
    case 'round':
      if (s.you.role === 'cracker') return 'cracker';
      if (s.you.role === 'crew') return 'crew';
      return 'lookout';
    case 'roundResult': return 'roundResult';
    case 'final': return 'final';
    default: return 'join';
  }
}

// Any in-room call the server refuses as unauthorized/gone means this tab's
// seat no longer exists; say so instead of leaving dead buttons.
async function call(event, payload) {
  const res = await rawCall(event, payload);
  if (store.state && res && !res.ok && sessionIsDead(res.error)) {
    clearSession();
    store.state = null;
    store.gone = res.error;
    render();
  }
  return res;
}

const actions = {
  call,
  serverNow,
  on,
  async leave() {
    await rawCall('room:leave');
    clearSession();
    store.state = null;
    render();
  },
  openRules,
  backToJoin() {
    store.gone = null;
    store.state = null;
    render();
  },
};

function render() {
  const name = screenFor();
  const changed = name !== store.current;
  store.current = name;
  for (const section of document.querySelectorAll('[data-screen]')) {
    section.hidden = section.dataset.screen !== name;
  }
  const root = $(`[data-screen="${name}"]`);
  SCREENS[name].render(root, store.state, actions, { changed });
  $('#status-room').textContent = store.state ? store.state.code : '';
  if (store.state && store.state.rules) $('#rules-text').textContent = store.state.rules;
}

// ── Status strip and offline dim ──────────────────────────────────────

let wakingTimer = null;
let offlineTimer = null;

function renderStatus() {
  const el = $('#status');
  el.className = `status status--${store.status}`;
  const text = $('#status-text');
  clearTimeout(wakingTimer);
  clearTimeout(offlineTimer);
  if (store.status === 'online') {
    text.textContent = 'Connected';
    $('#offline').hidden = true;
  } else if (store.status === 'connecting') {
    text.textContent = 'Connecting';
    wakingTimer = setTimeout(() => {
      text.textContent = 'Waking up the vault… first load can take a minute';
    }, WAKING_AFTER_MS);
  } else {
    text.textContent = 'Reconnecting…';
    offlineTimer = setTimeout(() => {
      $('#offline').hidden = false;
    }, OFFLINE_DIM_AFTER_MS);
  }
}

// ── Rules overlay ─────────────────────────────────────────────────────

function openRules() {
  $('#rules').hidden = false;
  $('#rules-close').focus();
}

function closeRules() {
  $('#rules').hidden = true;
  try {
    localStorage.setItem(RULES_SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

export function rulesSeen() {
  try {
    return localStorage.getItem(RULES_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

// ── Sound toggle ──────────────────────────────────────────────────────

function renderSoundButton() {
  const button = $('#sound-button');
  const on = sound.isEnabled();
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
  button.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  button.classList.toggle('status__icon--on', on);
}

$('#sound-button').addEventListener('click', async () => {
  await sound.setEnabled(!sound.isEnabled());
  renderSoundButton();
  sound.play('solved');
});

if (sound.restorePreference()) {
  // Can't start audio without a gesture; the first tap anywhere unlocks it.
  const unlock = async () => {
    await sound.setEnabled(true);
    renderSoundButton();
    document.removeEventListener('pointerdown', unlock);
  };
  document.addEventListener('pointerdown', unlock);
}
renderSoundButton();

// ── Set pieces, toasts and cues driven by server events ───────────────

const SETPIECE_MS = { opened: 1600, locked: 900, timeout: 900 };
let setpieceTimer = null;

function setpiece(result) {
  const el = $('#setpiece');
  $('#setpiece-word').textContent = result === 'opened' ? 'Vault opened' : result === 'locked' ? 'Vault locked' : "Time's up";
  el.className = `setpiece setpiece--${result}`;
  el.hidden = false;
  clearTimeout(setpieceTimer);
  setpieceTimer = setTimeout(() => { el.hidden = true; }, SETPIECE_MS[result] || 900);
}

let toastTimer = null;

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

on('strike', () => sound.play('strike'));
on('moduleSolved', () => sound.play('solved'));
on('shuffle', () => sound.play('shuffle'));
on('ended', (e) => {
  sound.play(e.result);
  setpiece(e.result);
});
on('playerJoined', (e, state) => {
  if (state && state.phase !== 'lobby' && e.playerId !== state.you.playerId) toast(`${e.nickname} joined`);
});
on('playerLeft', (e, state) => {
  if (!state) return;
  toast(e.pagesReassigned ? `${e.nickname} left — pages reassigned` : `${e.nickname} left`);
});

$('#help-button').addEventListener('click', openRules);
$('#rules-close').addEventListener('click', closeRules);
$('#rules').addEventListener('click', (e) => {
  if (e.target === $('#rules')) closeRules();
});

// ── Boot ──────────────────────────────────────────────────────────────

render();
renderStatus();

connect({
  onState(state) {
    store.state = state;
    store.gone = null;
    if (state.rules) $('#rules-text').textContent = state.rules;
    render();
  },
  onEvent: dispatch,
  onStatus(status) {
    store.status = status;
    renderStatus();
  },
  onGone(reason) {
    store.state = null;
    store.gone = reason;
    render();
  },
});
