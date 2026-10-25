// Socket connection, seat persistence and server clock offset.
//
// The client never invents a playerId; playerId and resumeToken both come
// from the server on create/join. See session.js for why the seat lives in
// sessionStorage.

import { createSessionStore, sessionIsDead } from './session.js';

const PING_SAMPLES = 3;
const RESUME_RETRIES = 3;
const RESUME_RETRY_MS = 1500;

const store = createSessionStore(window.sessionStorage);

let socket = null;
let offset = 0;

export const savedSession = () => store.load();
export const saveSession = (session) => store.save(session);
export const clearSession = () => store.clear();

export function serverNow() {
  return Date.now() + offset;
}

// Emits with an acknowledgement. Resolves to the ack, or to an error-shaped
// object if the server does not answer in time.
export function call(event, payload = {}, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) return resolve({ ok: false, error: 'offline' });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: 'timeout' });
    }, timeoutMs);
    socket.emit(event, payload, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res ?? { ok: false, error: 'no-ack' });
    });
  });
}

async function syncClock() {
  const samples = [];
  for (let i = 0; i < PING_SAMPLES; i++) {
    const t0 = Date.now();
    const res = await call('time:ping', { t0 }, 3000);
    const t1 = Date.now();
    if (res && typeof res.serverNow === 'number') samples.push(res.serverNow - (t0 + t1) / 2);
  }
  if (samples.length) {
    samples.sort((a, b) => a - b);
    offset = samples[Math.floor(samples.length / 2)];
  }
}

// Reclaims the saved seat. A dead seat is forgotten; a flaky network keeps
// it and tries again, and the next connect tries once more.
async function resume(onGone) {
  for (let attempt = 0; attempt < RESUME_RETRIES; attempt++) {
    const session = store.load();
    if (!session) return;
    const res = await call('room:resume', session);
    if (res.ok) return;
    if (sessionIsDead(res.error)) {
      store.clear();
      onGone(res.error);
      return;
    }
    if (!socket.connected) return;
    await new Promise((r) => setTimeout(r, RESUME_RETRY_MS));
  }
}

export function connect({ onState, onEvent, onStatus, onGone }) {
  socket = window.io({ transports: ['websocket', 'polling'] });
  onStatus('connecting');

  socket.on('connect', async () => {
    onStatus('online');
    await resume(onGone);
    await syncClock();
  });

  socket.on('disconnect', () => onStatus('reconnecting'));
  socket.io.on('reconnect_attempt', () => onStatus('reconnecting'));
  socket.on('state', onState);
  socket.on('event', onEvent);
  socket.on('room:gone', () => {
    store.clear();
    onGone('gone');
  });
  return socket;
}
