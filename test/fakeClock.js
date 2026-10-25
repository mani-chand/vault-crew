// A clock whose time only moves when a test says so. `advance` fires due
// timers in order; `set` moves time without firing anything, for testing
// the exact deadline boundary.

export function createFakeClock(start = 0) {
  let now = start;
  let nextId = 0;
  const timers = new Map();

  function dueBefore(target) {
    let next = null;
    for (const t of timers.values()) {
      if (t.at > target) continue;
      if (!next || t.at < next.at || (t.at === next.at && t.id < next.id)) next = t;
    }
    return next;
  }

  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++nextId;
      timers.set(id, { id, at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = now + ms;
      for (let t = dueBefore(target); t; t = dueBefore(target)) {
        timers.delete(t.id);
        now = t.at;
        t.fn();
      }
      now = target;
    },
    set(ms) {
      now = ms;
    },
    pending: () => timers.size,
  };
}
