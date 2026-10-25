// Timings and limits. Everything time-based is overridable through the
// `timings` option so tests can run a whole round in milliseconds.

export const ROUND_MS = 240000;
export const SHUFFLE_AT_MS = [60000, 120000, 180000];
export const SHUFFLE_WARN_MS = 5000;
export const REVEAL_MS = 3000;
export const NEXT_FALLBACK_MS = 10000;
export const GRACE_CREW_MS = 60000;
export const GRACE_CRACKER_MS = 30000;
export const ROOM_IDLE_MS = 1800000;
export const ROOM_SWEEP_MS = 60000;

export const STRIKES_MAX = 3;
export const ROUNDS_TOTAL = 5;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

export const DEFAULT_TIMINGS = Object.freeze({
  ROUND_MS,
  SHUFFLE_AT_MS,
  SHUFFLE_WARN_MS,
  REVEAL_MS,
  NEXT_FALLBACK_MS,
  GRACE_CREW_MS,
  GRACE_CRACKER_MS,
  ROOM_IDLE_MS,
  ROOM_SWEEP_MS,
});

export const realClock = Object.freeze({
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
});
