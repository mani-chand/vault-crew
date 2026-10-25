// Lobby: the code to shout across the table, who is here, and Start.

import { h, clear, append } from '../dom.js';

const MIN_PLAYERS = 2;

export function render(root, state, actions) {
  clear(root);
  const host = state.players.find((p) => p.isHost);
  const count = state.players.length;
  const error = h('p', { class: 'error', role: 'alert' });

  const startButton = state.you.isHost
    ? h(
      'button',
      {
        class: 'button button--primary',
        type: 'button',
        disabled: count < MIN_PLAYERS,
        onClick: async () => {
          const res = await actions.call('game:start');
          if (!res.ok) error.textContent = res.error === 'not-enough-players' ? 'Need at least 2 players.' : 'Could not start. Try again.';
        },
      },
      'Start the heist',
    )
    : null;

  append(root, [
    h('div', { class: 'stack' },
      h('p', { class: 'lobby__code-label' }, 'Room code — friends type this in'),
      h('div', { class: 'lobby__code', 'aria-label': `Room code ${state.code.split('').join(' ')}` }, state.code),
    ),
    h('ul', { class: 'players', 'aria-label': 'Players' },
      state.players.map((p) =>
        h('li', { class: `players__item${p.connected ? '' : ' players__item--away'}` },
          h('span', { class: 'players__name' }, p.nickname, p.playerId === state.you.playerId ? ' (you)' : ''),
          p.isHost ? h('span', { class: 'tag tag--host' }, 'Host') : null,
          p.connected ? null : h('span', { class: 'tag' }, 'reconnecting…'),
        ),
      ),
    ),
    h('p', { class: 'hint' },
      count < MIN_PLAYERS
        ? 'Need at least 2 players. Up to 6 can join.'
        : state.you.isHost
          ? `${count} of 6 here. Start when everyone's in.`
          : `Waiting for ${host ? host.nickname : 'the host'} to start.`,
    ),
    error,
    h('div', { class: 'spacer' }),
    startButton,
    h('button', { class: 'button button--quiet', type: 'button', onClick: actions.leave }, 'Leave room'),
  ]);
}
