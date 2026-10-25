// A room: the players at one table, the host, connection grace periods, and
// the phase machine lobby → reveal → round → roundResult → (reveal | final).
//
// Identity: `playerId` is public. Only `resumeToken` proves who you are, and
// it never leaves this class except as the return value of join().

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Match } from './match.js';
import { MIN_PLAYERS, MAX_PLAYERS, NICKNAME_MIN, NICKNAME_MAX } from './constants.js';

const ACTIVE_PHASES = ['reveal', 'round', 'roundResult'];

export class Room {
  constructor({ code, rng, clock, timings, onChange, onEvent }) {
    this.code = code;
    this.rng = rng;
    this.clock = clock;
    this.timings = timings;
    this.onChange = onChange;
    this.onEvent = onEvent;

    this.playersById = new Map();
    this.joinSeq = 0;
    this.hostId = null;
    this.phase = 'lobby';
    this.match = null;
    this.round = null;
    this.crackedCounts = {};
    this.resultAt = null;
    this.revealTimer = null;
    this.destroyed = false;
    this.lastActivityAt = clock.now();
  }

  get players() {
    return [...this.playersById.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => ({
        playerId: p.playerId,
        nickname: p.nickname,
        joinOrder: p.joinOrder,
        connected: p.connected,
        pending: p.pending,
        isHost: p.playerId === this.hostId,
      }));
  }

  get playerIds() {
    return this.players.map((p) => p.playerId);
  }

  touch() {
    this.lastActivityAt = this.clock.now();
  }

  changed() {
    if (this.destroyed) return;
    this.touch();
    this.onChange();
  }

  emit(type, data) {
    if (this.destroyed) return;
    this.onEvent(type, data, { to: 'all' });
  }

  // ── Membership ──────────────────────────────────────────────────────────

  join(playerId, nickname) {
    if (typeof nickname !== 'string') return { ok: false, error: 'bad-name' };
    const name = nickname.trim();
    const length = [...name].length;
    if (length < NICKNAME_MIN || length > NICKNAME_MAX) return { ok: false, error: 'bad-name' };
    if (this.playersById.size >= MAX_PLAYERS) return { ok: false, error: 'full' };
    const lower = name.toLowerCase();
    for (const p of this.playersById.values()) {
      if (p.nickname.toLowerCase() === lower) return { ok: false, error: 'name-taken' };
    }

    const resumeToken = randomBytes(32).toString('hex');
    this.playersById.set(playerId, {
      playerId,
      nickname: name,
      joinOrder: ++this.joinSeq,
      connected: true,
      pending: this.phase === 'reveal' || this.phase === 'round',
      resumeToken,
      graceTimer: null,
    });
    if (!this.hostId) this.hostId = playerId;
    this.emit('playerJoined', { playerId, nickname: name });
    this.changed();
    return { ok: true, resumeToken };
  }

  authenticate(playerId, resumeToken) {
    const p = this.playersById.get(playerId);
    if (!p || typeof resumeToken !== 'string') return false;
    const expected = Buffer.from(p.resumeToken);
    const given = Buffer.from(resumeToken);
    if (expected.length !== given.length) return false;
    return timingSafeEqual(expected, given);
  }

  leave(playerId) {
    if (!this.playersById.has(playerId)) return;
    this.remove(playerId);
  }

  disconnect(playerId) {
    const p = this.playersById.get(playerId);
    if (!p) return;
    p.connected = false;
    const isCracker = this.phase === 'round' && this.round && this.round.crackerId === playerId;
    const grace = isCracker ? this.timings.GRACE_CRACKER_MS : this.timings.GRACE_CREW_MS;
    if (p.graceTimer) this.clock.clearTimeout(p.graceTimer);
    p.graceTimer = this.clock.setTimeout(() => this.remove(playerId), grace);
    this.changed();
  }

  reconnect(playerId) {
    const p = this.playersById.get(playerId);
    if (!p) return false;
    if (p.graceTimer) this.clock.clearTimeout(p.graceTimer);
    p.graceTimer = null;
    p.connected = true;
    this.changed();
    return true;
  }

  remove(playerId) {
    const p = this.playersById.get(playerId);
    if (!p) return;
    if (p.graceTimer) this.clock.clearTimeout(p.graceTimer);
    this.playersById.delete(playerId);
    if (this.hostId === playerId) this.hostId = this.playerIds[0] ?? null;

    let pagesReassigned = false;
    if (this.round && !this.round.ended && (this.phase === 'reveal' || this.phase === 'round')) {
      if (this.round.crackerId === playerId) {
        this.round.crackerLeft();
      } else if (this.round.crewIds.includes(playerId)) {
        this.round.setCrew(this.round.crewIds.filter((id) => id !== playerId));
        pagesReassigned = true;
      }
    }
    this.emit('playerLeft', { playerId, nickname: p.nickname, pagesReassigned });
    this.ensureMinimum();
    this.changed();
  }

  // A match cannot continue with fewer than two players.
  ensureMinimum() {
    if (!ACTIVE_PHASES.includes(this.phase)) return;
    if (this.playersById.size >= MIN_PLAYERS) return;
    if (this.round && !this.round.ended) this.round.end('locked');
    this.cancelReveal();
    this.phase = 'final';
  }

  // ── Phase machine ───────────────────────────────────────────────────────

  start(byPlayerId) {
    if (this.phase !== 'lobby') return { ok: false, error: 'bad-phase' };
    if (byPlayerId !== this.hostId) return { ok: false, error: 'not-host' };
    if (this.playersById.size < MIN_PLAYERS) return { ok: false, error: 'not-enough-players' };
    this.newMatch();
    this.beginReveal();
    return { ok: true };
  }

  next(byPlayerId) {
    if (this.phase !== 'roundResult') return { ok: false, error: 'bad-phase' };
    const fallbackAt = this.resultAt + this.timings.NEXT_FALLBACK_MS;
    const allowed = this.playersById.has(byPlayerId) && (byPlayerId === this.hostId || this.clock.now() >= fallbackAt);
    if (!allowed) return { ok: false, error: 'not-allowed' };
    if (this.match.isComplete) {
      this.phase = 'final';
      this.round = null;
      this.changed();
    } else {
      this.beginReveal();
    }
    return { ok: true };
  }

  rematch(byPlayerId) {
    if (this.phase !== 'final') return { ok: false, error: 'bad-phase' };
    if (byPlayerId !== this.hostId) return { ok: false, error: 'not-host' };
    if (this.playersById.size < MIN_PLAYERS) return { ok: false, error: 'not-enough-players' };
    this.newMatch();
    this.beginReveal();
    return { ok: true };
  }

  newMatch() {
    this.match = new Match({
      playerIds: this.playerIds,
      crackedCounts: this.crackedCounts,
      rng: this.rng,
      clock: this.clock,
      timings: this.timings,
      onEvent: (type, data) => this.onRoundEvent(type, data),
    });
  }

  beginReveal() {
    for (const p of this.playersById.values()) p.pending = false;
    this.round = this.match.startRound(this.playerIds, { start: false });
    this.phase = 'reveal';
    this.resultAt = null;
    this.cancelReveal();
    this.revealTimer = this.clock.setTimeout(() => {
      this.revealTimer = null;
      if (this.phase !== 'reveal') return;
      this.round.start();
      this.phase = 'round';
      this.changed();
    }, this.timings.REVEAL_MS);
    this.changed();
  }

  cancelReveal() {
    if (this.revealTimer) this.clock.clearTimeout(this.revealTimer);
    this.revealTimer = null;
  }

  onRoundEvent(type, data) {
    if (type === 'ended') this.onRoundEnded();
    this.emit(type, data);
    // Strikes and solves happen inside action(), which already snapshots;
    // shuffles come from the round's own timers and must snapshot here.
    if (type === 'shuffle') this.changed();
  }

  onRoundEnded() {
    this.cancelReveal();
    this.match.recordRound(this.round);
    this.crackedCounts = { ...this.match.crackedCounts };
    this.phase = 'roundResult';
    this.resultAt = this.clock.now();
    this.changed();
  }

  action(playerId, moduleId, seq, action) {
    if (this.phase !== 'round') return { ok: false, error: 'bad-phase' };
    const res = this.round.action(playerId, moduleId, seq, action);
    if (res.ok) this.changed();
    else this.touch();
    return res;
  }

  roleOf(playerId) {
    if (!this.round || this.phase === 'lobby' || this.phase === 'final') return null;
    if (!this.playersById.has(playerId)) return null;
    return this.round.roleOf(playerId) ?? 'lookout';
  }

  destroy() {
    this.cancelReveal();
    for (const p of this.playersById.values()) {
      if (p.graceTimer) this.clock.clearTimeout(p.graceTimer);
    }
    if (this.round && !this.round.ended) this.round.end('locked');
    this.destroyed = true;
  }
}
