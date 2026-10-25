// Team score per round and the three end-of-match awards.

export function roundScore({ result, timeLeftMs, strikes }) {
  if (result !== 'opened') return 0;
  return 1000 + 5 * Math.floor(timeLeftMs / 1000) - 150 * strikes;
}

// `better(a, b)` is true when a beats b. Ties keep the earlier round.
function best(rounds, better) {
  let winner = rounds[0];
  for (const r of rounds.slice(1)) if (better(r, winner)) winner = r;
  return { crackerId: winner.crackerId, roundIndex: winner.roundIndex };
}

export function awards(rounds) {
  const opened = rounds.filter((r) => r.result === 'opened');
  if (opened.length === 0) return { mvp: null, fastest: null, cleanest: null };
  return {
    mvp: best(opened, (a, b) => a.score > b.score),
    fastest: best(opened, (a, b) => a.timeLeftMs > b.timeLeftMs),
    cleanest: best(opened, (a, b) => a.strikes < b.strikes || (a.strikes === b.strikes && a.timeLeftMs > b.timeLeftMs)),
  };
}
