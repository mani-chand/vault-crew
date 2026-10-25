// Join / create. Built once; later renders only refresh what changed, so
// typed text survives connection status flapping.

import { h, clear, append } from '../dom.js';
import { saveSession } from '../net.js';
import { rulesSeen } from '../app.js';

const NICK_KEY = 'vcNick';

const ERRORS = {
  'not-found': 'No room with that code.',
  full: 'That room is full (6 players).',
  'name-taken': 'Someone already has that name.',
  'bad-name': 'Name must be 2–12 characters.',
  'bad-code': 'Room codes are 4 letters.',
  timeout: 'The server did not answer. Try again.',
  offline: 'Not connected yet. Give it a moment.',
};

function savedNick() {
  try {
    return localStorage.getItem(NICK_KEY) || '';
  } catch {
    return '';
  }
}

function rememberNick(nick) {
  try {
    localStorage.setItem(NICK_KEY, nick);
  } catch {
    // ignore
  }
}

export function render(root, _state, actions) {
  if (root.dataset.built) return;
  root.dataset.built = '1';
  clear(root);

  const nickInput = h('input', {
    class: 'input',
    id: 'nick',
    type: 'text',
    autocomplete: 'nickname',
    placeholder: 'Your name',
    value: savedNick(),
  });
  const codeInput = h('input', {
    class: 'input input--code',
    id: 'code',
    type: 'text',
    inputmode: 'latin',
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: '····',
    'aria-label': 'Room code',
  });
  const error = h('p', { class: 'error', role: 'alert' });
  const joinButton = h('button', { class: 'button button--primary', type: 'submit' }, 'Join room');
  const createButton = h('button', { class: 'button', type: 'button' }, 'Start a new room');

  // No maxlength on these inputs: a pasted " abcd " must survive to be
  // trimmed, and emoji names are counted in code points, not UTF-16 units.
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  });
  nickInput.addEventListener('input', () => {
    const chars = [...nickInput.value];
    if (chars.length > 12) nickInput.value = chars.slice(0, 12).join('');
  });

  const busy = (on) => {
    joinButton.disabled = on;
    createButton.disabled = on;
  };

  const fail = (code) => {
    error.textContent = ERRORS[code] || 'Something went wrong. Try again.';
  };

  const nickname = () => nickInput.value.trim();

  const validName = () => {
    const length = [...nickname()].length;
    if (length < 2 || length > 12) {
      fail('bad-name');
      nickInput.focus();
      return false;
    }
    rememberNick(nickname());
    return true;
  };

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        if (!validName()) return;
        const code = codeInput.value.trim().toUpperCase();
        if (!/^[A-Z]{4}$/.test(code)) {
          fail('bad-code');
          codeInput.focus();
          return;
        }
        busy(true);
        const res = await actions.call('room:join', { code, nickname: nickname() });
        busy(false);
        if (!res.ok) return fail(res.error);
        saveSession({ code: res.code, playerId: res.playerId, resumeToken: res.resumeToken });
      },
    },
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'nick' }, 'Name'), nickInput),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'code' }, 'Room code'), codeInput),
    error,
    joinButton,
  );

  createButton.addEventListener('click', async () => {
    error.textContent = '';
    if (!validName()) return;
    busy(true);
    const res = await actions.call('room:create', { nickname: nickname() });
    busy(false);
    if (!res.ok) return fail(res.error);
    saveSession({ code: res.code, playerId: res.playerId, resumeToken: res.resumeToken });
  });

  append(root, [
    h('div', { class: 'stack' },
      h('h1', { class: 'join__title' }, 'Vault Crew'),
      h('p', { class: 'join__tagline' }, 'One of you sees the vault. The rest of you hold the manual. Four minutes. Talk fast.'),
    ),
    form,
    h('div', { class: 'join__divider' }, 'or'),
    createButton,
    h('div', { class: 'spacer' }),
    h('button', { class: 'button button--quiet', type: 'button', onClick: actions.openRules }, 'How to play'),
  ]);

  if (!rulesSeen()) actions.openRules();
}
