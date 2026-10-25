// Builds the role-specific snapshot a client receives. This is the only place
// game state is shaped for the wire: it reads crackerModules()/pagesFor() and
// never touches round.puzzles, so secrets and resume tokens cannot leak.

import { ROUNDS_TOTAL, STRIKES_MAX, RULES_TEXT } from './constants.js';

export function snapshotFor(room, playerId, now) {
  const players = room.players;
  const me = players.find((p) => p.playerId === playerId);
  if (!me) return null;

  const role = room.roleOf(playerId);
  const { phase, round, match, timings } = room;
  const inMatch = phase !== 'lobby' && match;
  const showRound = round && ['reveal', 'round', 'roundResult'].includes(phase);

  const snapshot = {
    code: room.code,
    phase,
    serverNow: now,
    you: { playerId, nickname: me.nickname, isHost: me.isHost, role, connected: me.connected },
    players: players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      isHost: p.isHost,
      connected: p.connected,
      pending: p.pending,
      role: room.roleOf(p.playerId),
    })),
    rules: RULES_TEXT,
    match: inMatch
      ? { roundIndex: match.roundIndex, roundsTotal: ROUNDS_TOTAL, rounds: match.rounds.slice(), total: match.summary().total }
      : null,
    round: null,
    cracker: null,
    crew: null,
    final: null,
  };

  if (showRound) {
    const cracker = players.find((p) => p.playerId === round.crackerId);
    snapshot.round = {
      roundIndex: round.roundIndex,
      crackerId: round.crackerId,
      crackerName: cracker ? cracker.nickname : (round.crackerName ?? null),
      startedAt: round.startedAt,
      endsAt: round.endsAt,
      durationMs: timings.ROUND_MS,
      strikes: round.strikes,
      strikesMax: STRIKES_MAX,
      modules: round.moduleStatus(),
      shuffleEnabled: round.shuffleEnabled,
      nextShuffleAt: round.nextShuffleAt,
      shuffleWarnMs: timings.SHUFFLE_WARN_MS,
      assignmentVersion: round.assignmentVersion,
      result: round.result,
      resultAt: room.resultAt,
      nextAllowedAt: room.resultAt === null ? null : room.resultAt + timings.NEXT_FALLBACK_MS,
    };
    if (role === 'cracker' && phase === 'round') snapshot.cracker = { modules: round.crackerModules() };
    if (role === 'crew') snapshot.crew = { pages: round.pagesFor(playerId) };
  }

  if (phase === 'final' && match) {
    snapshot.final = {
      ...match.summary(),
      players: players.map((p) => ({ playerId: p.playerId, nickname: p.nickname })),
    };
  }

  return snapshot;
}
