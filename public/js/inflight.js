// Locks a module's controls from the moment an action is sent until the
// server's next snapshot arrives (the normal case), or straight away if the
// server rejects the action. Without this, two quick taps within one round
// trip send the same seq twice: the second is dropped silently and the next
// tap lands on the wrong step, which costs a strike.

export function createInflightGate({ timeoutMs = 3000, now = Date.now } = {}) {
  let lockedAt = null;
  return {
    get locked() {
      return lockedAt !== null && now() - lockedAt < timeoutMs;
    },
    lock() {
      lockedAt = now();
    },
    release() {
      lockedAt = null;
    },
    // Returns 'waiting' when the ack was ok (the snapshot will release the
    // gate) and 'unlocked' when the server rejected the action.
    settle(res) {
      if (res && res.ok) return 'waiting';
      lockedAt = null;
      return 'unlocked';
    },
  };
}
