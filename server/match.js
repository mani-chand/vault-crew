// A match: five rounds, one set of manuals, fair Cracker rotation and the
// page-burden bookkeeping that carries across rounds.
//
// `crackedCounts` outlives a match (the Room keeps it) so a rematch starts
// with whoever has cracked the least.

import { Round } from './round.js';
import { generateManuals } from './modules/index.js';
import { roundScore, awards } from './scoring.js';
import { ROUNDS_TOTAL } from './constants.js';

export class Match {
  constructor({ playerIds, crackedCounts = {}, rng, clock, timings, onEvent }) {
    this.playerIds = playerIds.slice();
    this.crackedCounts = { ...crackedCounts };
    this.rng = rng;
    this.clock = clock;
    this.timings = timings;
    this.onEvent = onEvent;
    this.manuals = generateManuals(rng);
    this.burden = {};
    this.rounds = [];
    this.current = null;
  }

  get roundIndex() {
    return this.rounds.length;
  }

  get isComplete() {
    return this.rounds.length >= ROUNDS_TOTAL;
  }

  // Least-cracked present player; ties go to whoever is earlier in `presentIds`.
  nextCrackerId(presentIds) {
    let best = null;
    for (const id of presentIds) {
      const n = this.crackedCounts[id] ?? 0;
      if (best === null || n < (this.crackedCounts[best] ?? 0)) best = id;
    }
    return best;
  }

  // `start: false` deals the round (roles, pages) but leaves the clock for the
  // caller to start after the reveal screen.
  startRound(presentIds, { start = true } = {}) {
    if (this.isComplete) throw new Error('match is complete');
    const crackerId = this.nextCrackerId(presentIds);
    const round = new Round({
      roundIndex: this.roundIndex,
      crackerId,
      crewIds: presentIds.filter((id) => id !== crackerId),
      manuals: this.manuals,
      burden: this.burden,
      rng: this.rng,
      clock: this.clock,
      timings: this.timings,
      onEvent: this.onEvent,
    });
    round.deal();
    if (start) round.start();
    this.current = round;
    return round;
  }

  recordRound(round) {
    if (!round.ended) throw new Error('round not ended');
    const s = round.summary();
    this.rounds.push({
      roundIndex: round.roundIndex,
      crackerId: s.crackerId,
      result: s.result,
      timeLeftMs: s.timeLeftMs,
      strikes: s.strikes,
      solvedCount: s.solvedCount,
      score: roundScore(s),
    });
    this.crackedCounts[s.crackerId] = (this.crackedCounts[s.crackerId] ?? 0) + 1;
    if (this.current === round) this.current = null;
  }

  summary() {
    return {
      rounds: this.rounds.slice(),
      total: this.rounds.reduce((sum, r) => sum + r.score, 0),
      awards: awards(this.rounds),
    };
  }
}
