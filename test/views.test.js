import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/rng.js';
import { createFakeClock } from './fakeClock.js';
import { DEFAULT_TIMINGS, REVEAL_MS, ROUND_MS, ROUNDS_TOTAL, STRIKES_MAX, SHUFFLE_WARN_MS, RULES_TEXT } from '../server/constants.js';
import { MODULE_IDS } from '../server/modules/index.js';
import { Room } from '../server/room.js';
import { snapshotFor } from '../server/views.js';

function mk(n, { start = true } = {}) {
  const clock = createFakeClock(7000);
  const room = new Room({ code: 'WXYZ', rng: createRng(5), clock, timings: DEFAULT_TIMINGS, onChange: () => {}, onEvent: () => {} });
  const tokens = {};
  for (let i = 1; i <= n; i++) tokens[`p${i}`] = room.join(`p${i}`, `Player${i}`).resumeToken;
  if (start) {
    room.start('p1');
    clock.advance(REVEAL_MS);
  }
  const snap = (id) => snapshotFor(room, id, clock.now());
  return { room, clock, tokens, snap };
}

test('lobby snapshot has players, host flag, rules, and no match/round/cracker/crew/final', () => {
  const { snap } = mk(2, { start: false });
  const s = snap('p2');
  assert.equal(s.code, 'WXYZ');
  assert.equal(s.phase, 'lobby');
  assert.equal(s.serverNow, 7000);
  assert.deepEqual(s.you, { playerId: 'p2', nickname: 'Player2', isHost: false, role: null, connected: true });
  assert.deepEqual(s.players.map((p) => p.playerId), ['p1', 'p2']);
  assert.equal(s.players[0].isHost, true);
  assert.equal(s.rules, RULES_TEXT);
  assert.equal(s.match, null);
  assert.equal(s.round, null);
  assert.equal(s.cracker, null);
  assert.equal(s.crew, null);
  assert.equal(s.final, null);
});

test('cracker snapshot has cracker.modules without secrets and crew null', () => {
  const { snap } = mk(3);
  const s = snap('p1');
  assert.equal(s.you.role, 'cracker');
  assert.deepEqual(Object.keys(s.cracker.modules).sort(), [...MODULE_IDS].sort());
  for (const m of Object.values(s.cracker.modules)) {
    assert.equal(m.seq, 0);
    assert.equal(m.status, 'open');
    assert.equal('secret' in m, false);
  }
  assert.equal(s.crew, null);
  assert.equal(s.round.crackerId, 'p1');
  assert.equal(s.round.crackerName, 'Player1');
  assert.equal(s.round.durationMs, ROUND_MS);
  assert.equal(s.round.endsAt, s.round.startedAt + ROUND_MS);
  assert.equal(s.round.strikesMax, STRIKES_MAX);
  assert.equal(s.round.shuffleWarnMs, SHUFFLE_WARN_MS);
  assert.equal(s.round.shuffleEnabled, true);
  assert.equal(s.round.nextShuffleAt, s.round.startedAt + 60000);
  assert.equal(s.round.assignmentVersion, 1);
  assert.deepEqual(s.round.modules, { circuit: 'open', tumbler: 'open', glyphpad: 'open', pulse: 'open' });
  assert.equal(s.round.result, null);
  assert.deepEqual(s.match, { roundIndex: 0, roundsTotal: ROUNDS_TOTAL, rounds: [], total: 0 });
});

test('crew snapshot has only their pages, cracker null, modules status only', () => {
  const { room, snap } = mk(3);
  const s = snap('p2');
  assert.equal(s.you.role, 'crew');
  assert.equal(s.cracker, null);
  const mine = room.round.pagesFor('p2').map((p) => p.moduleId);
  assert.deepEqual(s.crew.pages.map((p) => p.moduleId), mine);
  for (const p of s.crew.pages) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.manual);
  }
  assert.deepEqual(s.round.modules, { circuit: 'open', tumbler: 'open', glyphpad: 'open', pulse: 'open' });
  assert.equal('puzzles' in s.round, false);
});

test('crew pages are visible during reveal so the reveal screen can name them', () => {
  const { snap } = mk(2, { start: false });
  const { room, clock } = mk(2, { start: false });
  room.start('p1');
  const s = snapshotFor(room, 'p2', clock.now());
  assert.equal(s.phase, 'reveal');
  assert.equal(s.crew.pages.length, 4);
  assert.equal(s.cracker, null);
  assert.equal(s.round.startedAt, null);
  void snap;
});

test('cracker modules are not sent during reveal', () => {
  const { room, clock } = mk(2, { start: false });
  room.start('p1');
  const s = snapshotFor(room, 'p1', clock.now());
  assert.equal(s.you.role, 'cracker');
  assert.equal(s.cracker, null);
});

test('lookout snapshot has neither cracker nor crew', () => {
  const { room, snap } = mk(6);
  const lookout = room.players.find((p) => room.roleOf(p.playerId) === 'lookout');
  const s = snap(lookout.playerId);
  assert.equal(s.you.role, 'lookout');
  assert.equal(s.cracker, null);
  assert.equal(s.crew, null);
  assert.equal(s.round.strikes, 0);
});

test('pending mid-round joiner gets the lookout view', () => {
  const { room, snap } = mk(3);
  room.join('p4', 'Late');
  const s = snap('p4');
  assert.equal(s.you.role, 'lookout');
  assert.equal(s.players.find((p) => p.playerId === 'p4').pending, true);
  assert.equal(s.crew, null);
});

test('snapshot JSON never contains "secret" or any resumeToken, for every player across a round', () => {
  const { room, clock, tokens, snap } = mk(5);
  const check = () => {
    for (const p of room.players) {
      const json = JSON.stringify(snap(p.playerId));
      assert.equal(json.includes('"secret"'), false);
      assert.equal(json.includes('resumeToken'), false);
      for (const t of Object.values(tokens)) assert.equal(json.includes(t), false);
    }
  };
  check();
  clock.advance(60000);
  check();
  clock.advance(ROUND_MS);
  check();
});

test('round result snapshot carries result, resultAt, nextAllowedAt and the recorded round', () => {
  const { room, clock, snap } = mk(2);
  clock.advance(ROUND_MS);
  const s = snap('p2');
  assert.equal(s.phase, 'roundResult');
  assert.equal(s.round.result, 'timeout');
  assert.equal(s.round.resultAt, clock.now());
  assert.equal(s.round.nextAllowedAt, clock.now() + DEFAULT_TIMINGS.NEXT_FALLBACK_MS);
  assert.equal(s.match.rounds.length, 1);
  assert.equal(s.match.rounds[0].score, 0);
  assert.equal(s.final, null);
  void room;
});

test('final snapshot has summary with rounds, total, awards and players', () => {
  const { room, clock, snap } = mk(2);
  for (let i = 0; i < ROUNDS_TOTAL; i++) {
    clock.advance(ROUND_MS);
    room.next('p1');
    if (room.phase === 'reveal') clock.advance(REVEAL_MS);
  }
  const s = snap('p1');
  assert.equal(s.phase, 'final');
  assert.equal(s.final.rounds.length, 5);
  assert.equal(typeof s.final.total, 'number');
  assert.deepEqual(Object.keys(s.final.awards).sort(), ['cleanest', 'fastest', 'mvp']);
  assert.deepEqual(s.final.players.map((p) => p.playerId), ['p1', 'p2']);
  assert.equal(s.round, null);
  assert.equal(s.cracker, null);
  assert.equal(s.crew, null);
});

test('crackerName survives the cracker leaving mid-round', () => {
  const { room, snap } = mk(3);
  room.leave('p1');
  assert.equal(room.phase, 'roundResult');
  const s = snap('p2');
  assert.equal(s.round.crackerId, 'p1');
  assert.equal(s.round.crackerName, 'Player1');
});

test('snapshot for an unknown player is null', () => {
  const { snap } = mk(2);
  assert.equal(snap('ghost'), null);
});
