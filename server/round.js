// One round of the heist: four puzzles, a server-owned clock, strikes, and the
// Manual Shuffle schedule. Pure logic; the clock and rng are injected.
//
// Roster is fixed at start(): the Room never adds a player to a running round.
// `setCrew` only ever receives a subset (a player was removed).
//
// `puzzles` is exposed for white-box tests only. views.js must never read it;
// clients get `crackerModules()` and `pagesFor()`.

import { MODULES, MODULE_IDS, generatePuzzles } from './modules/index.js';
import { assignPages } from './assignment.js';
import { STRIKES_MAX } from './constants.js';

export class Round {
  constructor({ roundIndex, crackerId, crewIds, manuals, burden, rng, clock, timings, onEvent }) {
    this.roundIndex = roundIndex;
    this.crackerId = crackerId;
    this.crewIds = crewIds.slice();
    this.manuals = manuals;
    this.burden = burden;
    this.rng = rng;
    this.clock = clock;
    this.timings = timings;
    this.onEvent = onEvent;

    this.puzzles = null;
    this.seqs = {};
    this.solved = {};
    this.strikes = 0;
    this.ended = false;
    this.result = null;
    this.startedAt = null;
    this.endsAt = null;
    this.endedAt = null;
    this.assignment = {};
    this.lookoutId = null;
    this.assignmentVersion = 0;
    this.timers = [];
    this.pendingShuffleAt = [];
  }

  // Generates the puzzles and deals the pages without starting the clock, so
  // the reveal screen can show roles and page names. Idempotent.
  deal() {
    if (this.puzzles) return;
    this.puzzles = generatePuzzles(this.rng, this.manuals);
    for (const id of MODULE_IDS) {
      this.seqs[id] = 0;
      this.solved[id] = false;
    }
    this.reassign();
  }

  start() {
    this.deal();
    this.startedAt = this.clock.now();
    this.endsAt = this.startedAt + this.timings.ROUND_MS;

    this.timers.push(this.clock.setTimeout(() => this.end('timeout'), this.timings.ROUND_MS));
    for (const at of this.timings.SHUFFLE_AT_MS) {
      this.pendingShuffleAt.push(this.startedAt + at);
      this.timers.push(this.clock.setTimeout(() => this.scheduledShuffle(this.startedAt + at), at));
    }
  }

  get shuffleEnabled() {
    return !this.ended && this.crewIds.length >= 2;
  }

  get nextShuffleAt() {
    if (!this.shuffleEnabled) return null;
    return this.pendingShuffleAt.length ? this.pendingShuffleAt[0] : null;
  }

  scheduledShuffle(at) {
    this.pendingShuffleAt = this.pendingShuffleAt.filter((t) => t !== at);
    if (this.ended || this.crewIds.length < 2) return;
    this.reassign('scheduled');
  }

  // Distribute pages; emit a shuffle event unless this is the initial deal.
  reassign(reason = null) {
    for (const id of this.crewIds) {
      if (!this.burden[id]) this.burden[id] = { double: 0, lookout: 0 };
    }
    const { assignment, lookoutId, extraHolderId } = assignPages(this.rng, {
      crewIds: this.crewIds,
      pageIds: MODULE_IDS,
      previous: this.assignmentVersion > 0 ? this.assignment : null,
      burden: this.burden,
    });
    if (extraHolderId) this.burden[extraHolderId].double += 1;
    if (lookoutId) this.burden[lookoutId].lookout += 1;
    this.assignment = assignment;
    this.lookoutId = lookoutId;
    this.assignmentVersion += 1;
    if (reason) {
      this.onEvent('shuffle', {
        shuffleId: `r${this.roundIndex}-v${this.assignmentVersion}`,
        assignmentVersion: this.assignmentVersion,
        reason,
      });
    }
  }

  setCrew(crewIds) {
    const next = [...crewIds].sort();
    const current = [...this.crewIds].sort();
    if (next.length === current.length && next.every((id, i) => id === current[i])) return;
    this.crewIds = crewIds.slice();
    if (this.ended) return;
    this.reassign('crewChanged');
  }

  crackerLeft() {
    this.end('locked');
  }

  end(result) {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    this.endedAt = this.clock.now();
    for (const t of this.timers) this.clock.clearTimeout(t);
    this.timers = [];
    this.pendingShuffleAt = [];
    this.onEvent('ended', { result });
  }

  seqOf(moduleId) {
    return this.seqs[moduleId];
  }

  action(playerId, moduleId, seq, action) {
    if (playerId !== this.crackerId) return { ok: false, error: 'not-cracker' };
    if (this.startedAt === null) return { ok: false, error: 'not-started' };
    if (!this.ended && this.clock.now() >= this.endsAt) this.end('timeout');
    if (this.ended) return { ok: false, error: 'round-over' };
    if (!MODULE_IDS.includes(moduleId)) return { ok: false, error: 'bad-module' };
    if (this.solved[moduleId]) return { ok: false, error: 'solved' };
    if (seq !== this.seqs[moduleId]) return { ok: false, error: 'stale' };
    if (!action || typeof action !== 'object') return { ok: false, error: 'bad-action' };

    this.seqs[moduleId] += 1;
    const { result } = MODULES[moduleId].validate(this.puzzles[moduleId], action);

    if (result === 'strike') {
      this.strikes += 1;
      this.onEvent('strike', { strikes: this.strikes, moduleId });
      if (this.strikes >= STRIKES_MAX) this.end('locked');
    } else if (result === 'solved') {
      this.solved[moduleId] = true;
      this.onEvent('moduleSolved', { moduleId });
      if (MODULE_IDS.every((id) => this.solved[id])) this.end('opened');
    }
    return { ok: true, result };
  }

  moduleStatus() {
    const status = {};
    for (const id of MODULE_IDS) status[id] = this.solved[id] ? 'solved' : 'open';
    return status;
  }

  crackerModules() {
    const out = {};
    for (const id of MODULE_IDS) {
      out[id] = {
        ...structuredClone(this.puzzles[id].view),
        seq: this.seqs[id],
        status: this.solved[id] ? 'solved' : 'open',
      };
    }
    return out;
  }

  pagesFor(playerId) {
    const pages = this.assignment[playerId] || [];
    return pages.map((moduleId) => ({ moduleId, name: MODULES[moduleId].name, manual: this.manuals[moduleId] }));
  }

  roleOf(playerId) {
    if (playerId === this.crackerId) return 'cracker';
    if (!this.crewIds.includes(playerId)) return null;
    return (this.assignment[playerId] || []).length > 0 ? 'crew' : 'lookout';
  }

  summary() {
    const endedAt = this.endedAt ?? this.clock.now();
    return {
      result: this.result,
      timeLeftMs: this.endsAt === null ? 0 : Math.max(0, this.endsAt - endedAt),
      strikes: this.strikes,
      solvedCount: MODULE_IDS.filter((id) => this.solved[id]).length,
      crackerId: this.crackerId,
    };
  }
}
