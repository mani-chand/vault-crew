// Countdown rendering from server time. One ticker updates every mounted
// timer, so re-rendering a screen never leaks intervals.

import { serverNow } from './net.js';

const TICK_MS = 250;
const AMBER_UNDER_MS = 60000;
const RED_UNDER_MS = 15000;

let ticker = null;

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function tick() {
  const timers = document.querySelectorAll('[data-ends-at]');
  if (timers.length === 0) {
    clearInterval(ticker);
    ticker = null;
    return;
  }
  const now = serverNow();
  for (const el of timers) {
    const endsAt = Number(el.dataset.endsAt);
    const left = endsAt - now;
    el.textContent = formatClock(left);
    el.classList.toggle('timer--amber', left < AMBER_UNDER_MS && left >= RED_UNDER_MS);
    el.classList.toggle('timer--red', left < RED_UNDER_MS);
  }
}

// Sets `el` up as a live countdown to `endsAt` (server ms). A null endsAt
// shows the full duration, frozen (the reveal screen, before the clock runs).
export function mountTimer(el, { endsAt, durationMs }) {
  if (endsAt === null || endsAt === undefined) {
    delete el.dataset.endsAt;
    el.textContent = formatClock(durationMs);
    el.classList.remove('timer--amber', 'timer--red');
    return el;
  }
  el.dataset.endsAt = String(endsAt);
  el.textContent = formatClock(endsAt - serverNow());
  if (!ticker) ticker = setInterval(tick, TICK_MS);
  return el;
}

// Freezes a timer at the given remaining time (round over).
export function freezeTimer(el, leftMs) {
  delete el.dataset.endsAt;
  el.textContent = formatClock(leftMs);
  el.classList.remove('timer--amber', 'timer--red');
  return el;
}
