// Round result (between rounds) and the final scoreboard.

import { h, clear, append } from '../dom.js';
import { formatClock } from '../timer.js';
import { serverNow } from '../net.js';

const HEADLINES = {
  opened: { text: 'Vault opened', tone: 'teal' },
  locked: { text: 'Vault locked', tone: 'red' },
  timeout: { text: "Time's up", tone: 'amber' },
};

function resultWord(result) {
  return result === 'opened' ? 'opened' : result === 'locked' ? 'locked' : 'timed out';
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, value), h('span', { class: 'stat__label' }, label));
}

export function renderRoundResult(root, state, actions) {
  clear(root);
  const { round, match } = state;
  const recorded = match.rounds.find((r) => r.roundIndex === round.roundIndex) || {};
  const headline = HEADLINES[round.result] || HEADLINES.timeout;
  const isLast = match.rounds.length >= match.roundsTotal;
  const timeLeft = recorded.timeLeftMs ?? 0;
  const error = h('p', { class: 'error', role: 'alert' });

  const nextLabel = isLast ? 'See the final score' : 'Next round';
  const nextButton = h('button', {
    class: 'button button--primary',
    type: 'button',
    onClick: async () => {
      const res = await actions.call('round:next');
      if (!res.ok) error.textContent = res.error === 'not-allowed' ? 'Only the host can continue right now.' : 'Could not continue. Try again.';
    },
  }, nextLabel);

  if (!state.you.isHost) {
    const hostName = (state.players.find((p) => p.isHost) || {}).nickname || 'the host';
    const update = () => {
      if (!nextButton.isConnected) return clearInterval(interval);
      const left = round.nextAllowedAt - serverNow();
      if (left > 0) {
        nextButton.disabled = true;
        nextButton.textContent = `Waiting for ${hostName}… you can continue in ${Math.ceil(left / 1000)}s`;
      } else {
        nextButton.disabled = false;
        nextButton.textContent = nextLabel;
      }
    };
    const interval = setInterval(update, 250);
    update();
  }

  append(root, [
    h('div', { class: `result result--${headline.tone}` },
      h('p', { class: 'result__round' }, `Round ${round.roundIndex + 1} of ${match.roundsTotal} · ${round.crackerName} cracked`),
      h('h1', { class: 'result__title' }, headline.text),
      h('p', { class: 'hint' }, round.result === 'opened'
        ? 'All four modules, clean exit.'
        : round.result === 'locked'
          ? 'Three strikes. The vault sealed itself.'
          : 'The clock ran out with the vault still shut.'),
    ),
    h('div', { class: 'stats' },
      stat('time left', formatClock(timeLeft)),
      stat('strikes', String(recorded.strikes ?? round.strikes)),
      stat('modules', `${recorded.solvedCount ?? 0}/4`),
      stat('round score', String(recorded.score ?? 0)),
    ),
    h('p', { class: 'hint' }, `Team total so far: ${match.total}`),
    error,
    h('div', { class: 'spacer' }),
    nextButton,
  ]);
}

function summaryText(final, nameOf) {
  const opened = final.rounds.filter((r) => r.result === 'opened').length;
  const mvp = final.awards.mvp ? nameOf(final.awards.mvp.crackerId) : 'nobody';
  const lines = [
    `Vault Crew — ${opened}/${final.rounds.length} vaults opened — ${final.total} pts — MVP: ${mvp}`,
    ...final.rounds.map((r) =>
      `R${r.roundIndex + 1} ${nameOf(r.crackerId)} — ${resultWord(r.result)}, ${formatClock(r.timeLeftMs)} left, ${r.strikes} strike${r.strikes === 1 ? '' : 's'}, ${r.score} pts`),
  ];
  return lines.join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

export function renderFinal(root, state, actions) {
  clear(root);
  const { final } = state;
  const names = Object.fromEntries(final.players.map((p) => [p.playerId, p.nickname]));
  const nameOf = (id) => names[id] || 'someone who left';
  const opened = final.rounds.filter((r) => r.result === 'opened').length;
  const error = h('p', { class: 'error', role: 'alert' });

  const award = (label, a, detail) => a
    ? h('div', { class: 'award' }, h('span', { class: 'award__label' }, label), h('span', { class: 'award__name' }, nameOf(a.crackerId)), h('span', { class: 'award__detail' }, detail(final.rounds[a.roundIndex])))
    : null;

  const copyButton = h('button', {
    class: 'button',
    type: 'button',
    onClick: async () => {
      const ok = await copyText(summaryText(final, nameOf));
      copyButton.textContent = ok ? 'Copied' : 'Copy failed — select the table instead';
      setTimeout(() => { copyButton.textContent = 'Copy summary'; }, 2000);
    },
  }, 'Copy summary');

  append(root, [
    h('div', { class: 'final-head' },
      h('p', { class: 'hint' }, `${opened} of ${final.rounds.length} vaults opened`),
      h('h1', { class: 'final-total' }, String(final.total)),
      h('p', { class: 'hint' }, 'team points'),
    ),
    h('div', { class: 'awards' },
      award('MVP Cracker', final.awards.mvp, (r) => `${r.score} pts in round ${r.roundIndex + 1}`),
      award('Fastest crack', final.awards.fastest, (r) => `${formatClock(r.timeLeftMs)} left`),
      award('Cleanest crack', final.awards.cleanest, (r) => `${r.strikes} strike${r.strikes === 1 ? '' : 's'}`),
    ),
    h('table', { class: 'rounds' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Round'), h('th', {}, 'Cracker'), h('th', {}, 'Result'), h('th', {}, 'Left'), h('th', {}, 'Strikes'), h('th', {}, 'Score'))),
      h('tbody', {},
        final.rounds.map((r) =>
          h('tr', { class: `rounds__row rounds__row--${r.result}` },
            h('td', {}, String(r.roundIndex + 1)),
            h('td', {}, nameOf(r.crackerId)),
            h('td', {}, resultWord(r.result)),
            h('td', {}, formatClock(r.timeLeftMs)),
            h('td', {}, String(r.strikes)),
            h('td', {}, String(r.score)),
          ),
        ),
      ),
    ),
    copyButton,
    error,
    h('div', { class: 'spacer' }),
    state.you.isHost
      ? h('button', {
        class: 'button button--primary',
        type: 'button',
        onClick: async () => {
          const res = await actions.call('match:rematch');
          if (!res.ok) error.textContent = res.error === 'not-enough-players' ? 'Need at least 2 players for a rematch.' : 'Could not start a rematch.';
        },
      }, 'Rematch')
      : h('p', { class: 'hint' }, 'The host can start a rematch.'),
    h('button', { class: 'button button--quiet', type: 'button', onClick: actions.leave }, 'Leave room'),
  ]);
}
