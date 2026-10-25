// Socket connection, session persistence and server clock offset.
//
// The session (room code, playerId, resumeToken) lives in localStorage so a
// phone that locks and wakes picks its seat back up. The client never
// invents a playerId; both ids come from the server on create/join.

const SESSION_KEY = 'vcSession';
const PING_SAMPLES = 3;

let socket = null;
let offset = 0;

export function savedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private mode or blocked storage: resume just won't work on this device.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

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

export function connect({ onState, onEvent, onStatus, onGone }) {
  socket = window.io({ transports: ['websocket', 'polling'] });
  onStatus('connecting');

  socket.on('connect', async () => {
    onStatus('online');
    await syncClock();
    const session = savedSession();
    if (!session) return;
    const res = await call('room:resume', session);
    if (!res.ok) {
      clearSession();
      onGone(res.error);
    }
  });

  socket.on('disconnect', () => onStatus('reconnecting'));
  socket.io.on('reconnect_attempt', () => onStatus('reconnecting'));
  socket.on('state', onState);
  socket.on('event', onEvent);
  socket.on('room:gone', () => {
    clearSession();
    onGone('gone');
  });
  return socket;
}
