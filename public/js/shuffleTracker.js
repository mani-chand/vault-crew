// Remembers which shuffle events have already been shown, so a re-sent
// event never double-flashes and a new round (whose versions restart at 1)
// still flashes. Keyed by shuffleId, which is unique per round and version.

const MAX_REMEMBERED = 64;

export function createShuffleTracker() {
  const seen = new Set();
  return {
    isNew(shuffleId) {
      if (!shuffleId || seen.has(shuffleId)) return false;
      seen.add(shuffleId);
      if (seen.size > MAX_REMEMBERED) seen.delete(seen.values().next().value);
      return true;
    },
  };
}
