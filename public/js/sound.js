// Short synthesized cues. Off until the player taps the speaker toggle,
// because mobile browsers only unlock audio on a user gesture.

const KEY = 'vcSound';

let ctx = null;
let enabled = false;

export function isEnabled() {
  return enabled;
}

export function restorePreference() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export async function setEnabled(on) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
  if (on) {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { enabled = false; return; }
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') await ctx.resume();
  }
}

function tone({ freq, at = 0, duration = 0.12, type = 'sine', gain = 0.18, slideTo = null }) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const t0 = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

const CUES = {
  strike: () => {
    tone({ freq: 180, duration: 0.22, type: 'sawtooth', gain: 0.14, slideTo: 90 });
  },
  solved: () => {
    tone({ freq: 660, duration: 0.1 });
    tone({ freq: 990, at: 0.1, duration: 0.16 });
  },
  shuffle: () => {
    tone({ freq: 520, duration: 0.07, type: 'triangle' });
    tone({ freq: 640, at: 0.08, duration: 0.07, type: 'triangle' });
    tone({ freq: 780, at: 0.16, duration: 0.1, type: 'triangle' });
  },
  opened: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, at: i * 0.11, duration: 0.3, gain: 0.16 }));
  },
  locked: () => {
    tone({ freq: 160, duration: 0.5, type: 'square', gain: 0.1, slideTo: 60 });
    tone({ freq: 110, at: 0.25, duration: 0.6, type: 'sawtooth', gain: 0.12, slideTo: 40 });
  },
  timeout: () => {
    tone({ freq: 330, duration: 0.25, type: 'triangle' });
    tone({ freq: 247, at: 0.3, duration: 0.4, type: 'triangle' });
  },
};

export function play(name) {
  if (!enabled || !ctx || !CUES[name]) return;
  try {
    CUES[name]();
  } catch {
    // Audio is a nicety; never let it break the game.
  }
}
