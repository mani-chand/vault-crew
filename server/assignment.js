// Distributes the four manual pages across the Crew. Sizes follow the table
// in the spec (1 crew → 4 pages; 2 → 2+2; 3 → 2+1+1; 4 → 1 each; 5 → 1 each
// plus a Lookout holding none). Who carries the extra page or sits as Lookout
// is whoever has done it least so far, so the burden evens out over a match.
//
// The "must differ from previous" guarantee is structural, not retried: pages
// are laid over the holders by rotating the page list; if that reproduces the
// previous assignment the rotation moves one step, which with two or more
// holders always changes at least one player's pages.

function leastBurdened(rng, ids, key, burden, count) {
  const shuffled = rng.shuffle(ids);
  shuffled.sort((a, b) => (burden[a]?.[key] ?? 0) - (burden[b]?.[key] ?? 0));
  return shuffled.slice(0, count);
}

function canonical(assignment) {
  return JSON.stringify(
    Object.keys(assignment)
      .sort()
      .map((id) => [id, [...assignment[id]].sort()]),
  );
}

export function assignPages(rng, { crewIds, pageIds, previous = null, burden = {} }) {
  const m = pageIds.length;
  if (crewIds.length === 0) return { assignment: {}, lookoutId: null, extraHolderId: null };

  let lookoutId = null;
  let holders = crewIds.slice();
  if (holders.length > m) {
    [lookoutId] = leastBurdened(rng, holders, 'lookout', burden, 1);
    holders = holders.filter((id) => id !== lookoutId);
  }

  const h = holders.length;
  const base = Math.floor(m / h);
  const extraCount = m % h;
  const extraHolders = extraCount > 0 ? leastBurdened(rng, holders, 'double', burden, extraCount) : [];
  const extraHolderId = extraCount === 1 ? extraHolders[0] : null;
  const ordered = [...rng.shuffle(extraHolders), ...rng.shuffle(holders.filter((id) => !extraHolders.includes(id)))];

  const build = (offset) => {
    const rotated = pageIds.slice(offset).concat(pageIds.slice(0, offset));
    const assignment = {};
    let idx = 0;
    for (const id of ordered) {
      const size = base + (extraHolders.includes(id) ? 1 : 0);
      assignment[id] = rotated.slice(idx, idx + size);
      idx += size;
    }
    if (lookoutId) assignment[lookoutId] = [];
    return assignment;
  };

  const offset = rng.int(0, m - 1);
  let assignment = build(offset);
  if (previous && h >= 2 && canonical(assignment) === canonical(previous)) {
    assignment = build((offset + 1) % m);
  }
  return { assignment, lookoutId, extraHolderId };
}
