// Three seconds of "this is who you are" before the clock starts.

import { h, clear, append } from '../dom.js';

export function render(root, state) {
  clear(root);
  const role = state.you.role;
  const roundLabel = `Round ${state.round.roundIndex + 1} of ${state.match.roundsTotal}`;

  let title;
  let body;
  let tone;
  if (role === 'cracker') {
    tone = 'amber';
    title = "You're the Cracker";
    body = 'You see the vault. Say out loud exactly what is on your screen. Do what the Crew tells you.';
  } else if (role === 'crew') {
    tone = 'teal';
    const names = state.crew ? state.crew.pages.map((p) => p.name) : [];
    title = "You're Crew";
    body = names.length
      ? `Your page${names.length > 1 ? 's' : ''}: ${names.join(', ')}. Listen to ${state.round.crackerName}, read your page, tell them what to do.`
      : 'Listen and help.';
  } else {
    tone = 'muted';
    title = "You're the Lookout";
    body = `No page this minute. Watch the clock and the strikes and call them out. ${state.round.crackerName} is cracking.`;
  }

  append(root, [
    h('div', { class: `reveal reveal--${tone}` },
      h('p', { class: 'reveal__round' }, roundLabel),
      h('h1', { class: 'reveal__title' }, title),
      h('p', { class: 'reveal__body' }, body),
    ),
  ]);
}
