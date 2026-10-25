import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/rng.js';
import { createFakeClock } from './fakeClock.js';
import { DEFAULT_TIMINGS, REVEAL_MS, ROUND_MS, GRACE_CREW_MS, GRACE_CRACKER_MS, NEXT_FALLBACK_MS, ROUNDS_TOTAL } from '../server/constants.js';
import { MODULE_IDS } from '../server/modules/index.js';
import { Room } from '../server/room.js';

function mk() {
  const events = [];
  let changes = 0;
  const clock = createFakeClock(5000);
  const room = new Room({
    code: 'ABCD',
    rng: createRng(1),
    clock,
    timings: DEFAULT_TIMINGS,
    onChange: () => { changes += 1; },
    onEvent: (type, data, opts) => events.push([type, data, opts]),
  });
  const tokens = {};
  const joinN = (n) => {
    for (let i = 1; i <= n; i++) {
      const res = room.join(`p${i}`, `Player${i}`);
      assert.equal(res.ok, true, `join p${i}`);
      tokens[`p${i}`] = res.resumeToken;
    }
  };
  const startGame = () => {
    assert.deepEqual(room.start('p1'), { ok: true });
    clock.advance(REVEAL_MS);
    assert.equal(room.phase, 'round');
  };
  return { room, clock, events, tokens, joinN, startGame, changes: () => changes };
}

const ofType = (events, t) => events.filter(([type]) => type === t);

test('join validates nickname: trims, 2–12 code points, rejects empty and 13 chars, stores html verbatim', () => {
  const { room } = mk();
  assert.equal(room.join('p1', '  <b>hi</b> ').ok, true);
  assert.equal(room.players[0].nickname, '<b>hi</b>');
  assert.deepEqual(room.join('p2', 'a'), { ok: false, error: 'bad-name' });
  assert.deepEqual(room.join('p3', 'x'.repeat(13)), { ok: false, error: 'bad-name' });
  assert.deepEqual(room.join('p4', '   '), { ok: false, error: 'bad-name' });
  assert.deepEqual(room.join('p5', 42), { ok: false, error: 'bad-name' });
  assert.equal(room.join('p6', '🙂🙂').ok, true);
  assert.equal(room.join('p7', 'x'.repeat(12)).ok, true);
});

test('duplicate nickname case-insensitive rejected name-taken', () => {
  const { room } = mk();
  room.join('p1', 'Sam');
  assert.deepEqual(room.join('p2', ' sam '), { ok: false, error: 'name-taken' });
  assert.deepEqual(room.join('p3', 'SAM'), { ok: false, error: 'name-taken' });
});

test('seventh player rejected full', () => {
  const { room, joinN } = mk();
  joinN(6);
  assert.deepEqual(room.join('p7', 'Seven'), { ok: false, error: 'full' });
});

test('join returns a 64-hex resumeToken; authenticate accepts it and rejects wrong token and unknown player', () => {
  const { room, tokens, joinN } = mk();
  joinN(2);
  assert.match(tokens.p1, /^[0-9a-f]{64}$/);
  assert.notEqual(tokens.p1, tokens.p2);
  assert.equal(room.authenticate('p1', tokens.p1), true);
  assert.equal(room.authenticate('p1', tokens.p2), false);
  assert.equal(room.authenticate('p1', 'short'), false);
  assert.equal(room.authenticate('p1', undefined), false);
  assert.equal(room.authenticate('nobody', tokens.p1), false);
});

test('first joiner is host; host migrates on leave; leave emits playerLeft', () => {
  const { room, events, joinN } = mk();
  joinN(3);
  assert.equal(room.hostId, 'p1');
  assert.equal(room.players.find((p) => p.playerId === 'p1').isHost, true);
  room.leave('p1');
  assert.equal(room.hostId, 'p2');
  assert.equal(room.players.length, 2);
  assert.equal(ofType(events, 'playerLeft').at(-1)[1].playerId, 'p1');
});

test('start requires host and at least 2 players, and only from the lobby', () => {
  const { room, joinN } = mk();
  joinN(1);
  assert.deepEqual(room.start('p1'), { ok: false, error: 'not-enough-players' });
  room.join('p2', 'Two');
  assert.deepEqual(room.start('p2'), { ok: false, error: 'not-host' });
  assert.deepEqual(room.start('p1'), { ok: true });
  assert.deepEqual(room.start('p1'), { ok: false, error: 'bad-phase' });
});

test('start → reveal with roles and pages dealt but clock not running → round after REVEAL_MS', () => {
  const { room, clock, joinN } = mk();
  joinN(3);
  room.start('p1');
  assert.equal(room.phase, 'reveal');
  assert.ok(room.round);
  assert.equal(room.round.startedAt, null);
  assert.equal(room.roleOf('p1'), 'cracker');
  assert.equal(room.roleOf('p2'), 'crew');
  assert.equal(room.round.pagesFor('p2').length + room.round.pagesFor('p3').length, 4);
  clock.advance(REVEAL_MS - 1);
  assert.equal(room.phase, 'reveal');
  clock.advance(1);
  assert.equal(room.phase, 'round');
  assert.equal(room.round.startedAt, 5000 + REVEAL_MS);
  assert.equal(room.round.endsAt, 5000 + REVEAL_MS + ROUND_MS);
});

test('round end → roundResult; host can next immediately; others only after NEXT_FALLBACK_MS; next starts round 2', () => {
  const { room, clock, joinN, startGame } = mk();
  joinN(3);
  startGame();
  clock.advance(ROUND_MS);
  assert.equal(room.phase, 'roundResult');
  assert.equal(room.match.rounds.length, 1);
  assert.equal(room.match.rounds[0].result, 'timeout');
  assert.deepEqual(room.next('p2'), { ok: false, error: 'not-allowed' });
  clock.advance(NEXT_FALLBACK_MS);
  assert.deepEqual(room.next('p2'), { ok: true });
  assert.equal(room.phase, 'reveal');
  assert.equal(room.round.roundIndex, 1);
  assert.equal(room.roleOf('p2'), 'cracker');
  assert.deepEqual(room.next('p1'), { ok: false, error: 'bad-phase' });
});

test('host next is allowed immediately', () => {
  const { room, clock, joinN, startGame } = mk();
  joinN(2);
  startGame();
  clock.advance(ROUND_MS);
  assert.deepEqual(room.next('p1'), { ok: true });
});

test('five rounds → final with summary; rematch → reveal with least-cracked player first', () => {
  const { room, clock, joinN, startGame } = mk();
  joinN(3);
  startGame();
  const crackers = [room.round.crackerId];
  for (let i = 1; i < ROUNDS_TOTAL; i++) {
    clock.advance(ROUND_MS);
    assert.equal(room.phase, 'roundResult');
    room.next('p1');
    clock.advance(REVEAL_MS);
    crackers.push(room.round.crackerId);
  }
  clock.advance(ROUND_MS);
  assert.equal(room.phase, 'roundResult');
  room.next('p1');
  assert.equal(room.phase, 'final');
  assert.deepEqual(crackers, ['p1', 'p2', 'p3', 'p1', 'p2']);
  assert.equal(room.match.summary().rounds.length, 5);
  assert.deepEqual(room.rematch('p2'), { ok: false, error: 'not-host' });
  assert.deepEqual(room.rematch('p1'), { ok: true });
  assert.equal(room.phase, 'reveal');
  assert.equal(room.round.crackerId, 'p3');
  assert.equal(room.match.rounds.length, 0);
});

test('crew disconnect: still listed, connected=false; removed after GRACE_CREW_MS and pages reassigned', () => {
  const { room, clock, events, joinN, startGame } = mk();
  joinN(4);
  startGame();
  room.disconnect('p3');
  const p3 = room.players.find((p) => p.playerId === 'p3');
  assert.equal(p3.connected, false);
  assert.equal(room.players.length, 4);
  clock.advance(GRACE_CREW_MS - 1);
  assert.equal(room.players.length, 4);
  clock.advance(1);
  assert.equal(room.players.length, 3);
  assert.equal(room.phase, 'round');
  assert.deepEqual(room.round.crewIds.sort(), ['p2', 'p4']);
  assert.equal(ofType(events, 'shuffle').at(-1)[1].reason, 'crewChanged');
  assert.equal(ofType(events, 'playerLeft').at(-1)[1].playerId, 'p3');
  const all = ['p2', 'p4'].flatMap((id) => room.round.pagesFor(id).map((p) => p.moduleId)).sort();
  assert.deepEqual(all, [...MODULE_IDS].sort());
});

test('cracker disconnect: removed after GRACE_CRACKER_MS and round locked', () => {
  const { room, clock, joinN, startGame } = mk();
  joinN(3);
  startGame();
  room.disconnect('p1');
  clock.advance(GRACE_CRACKER_MS - 1);
  assert.equal(room.phase, 'round');
  clock.advance(1);
  assert.equal(room.phase, 'roundResult');
  assert.equal(room.match.rounds[0].result, 'locked');
  assert.equal(room.players.length, 2);
  assert.equal(room.hostId, 'p2');
});

test('reconnect within grace cancels removal; reconnect of unknown player is false', () => {
  const { room, clock, joinN, startGame } = mk();
  joinN(3);
  startGame();
  room.disconnect('p2');
  clock.advance(GRACE_CREW_MS - 1);
  assert.equal(room.reconnect('p2'), true);
  clock.advance(GRACE_CREW_MS * 2);
  assert.equal(room.players.length, 3);
  assert.equal(room.players.find((p) => p.playerId === 'p2').connected, true);
  assert.equal(room.reconnect('ghost'), false);
});

test('disconnect in the lobby uses the crew grace and removes the player', () => {
  const { room, clock, joinN } = mk();
  joinN(2);
  room.disconnect('p2');
  clock.advance(GRACE_CREW_MS);
  assert.equal(room.players.length, 1);
  assert.equal(room.phase, 'lobby');
});

test('room shrinks below 2 mid-round → round locked, match ends, phase final', () => {
  const { room, joinN, startGame } = mk();
  joinN(2);
  startGame();
  room.leave('p2');
  assert.equal(room.phase, 'final');
  assert.equal(room.match.rounds.length, 1);
  assert.equal(room.match.rounds[0].result, 'locked');
});

test('mid-round joiner: pending, role lookout now, not in round crew, full player next round', () => {
  const { room, clock, joinN, startGame } = mk();
  joinN(3);
  startGame();
  assert.equal(room.join('p4', 'Late').ok, true);
  const late = room.players.find((p) => p.playerId === 'p4');
  assert.equal(late.pending, true);
  assert.equal(room.roleOf('p4'), 'lookout');
  assert.equal(room.round.crewIds.includes('p4'), false);
  assert.deepEqual(room.round.pagesFor('p4'), []);
  clock.advance(60000);
  assert.deepEqual(room.round.pagesFor('p4'), []);
  clock.advance(ROUND_MS);
  room.next('p1');
  assert.equal(room.players.find((p) => p.playerId === 'p4').pending, false);
  assert.ok([room.round.crackerId, ...room.round.crewIds].includes('p4'));
});

test('joiner during roundResult is not pending and is in the next round roster', () => {
  const { room, clock, joinN, startGame } = mk();
  joinN(2);
  startGame();
  clock.advance(ROUND_MS);
  assert.equal(room.join('p3', 'Three').ok, true);
  assert.equal(room.players.find((p) => p.playerId === 'p3').pending, false);
  room.next('p1');
  assert.ok([room.round.crackerId, ...room.round.crewIds].includes('p3'));
});

test('mid-round joiner still counts toward the cap', () => {
  const { room, joinN, startGame } = mk();
  joinN(5);
  startGame();
  assert.equal(room.join('p6', 'Six').ok, true);
  assert.deepEqual(room.join('p7', 'Seven'), { ok: false, error: 'full' });
});

test('action in lobby rejected bad-phase; in round it reaches the Round', () => {
  const { room, joinN, startGame } = mk();
  joinN(2);
  assert.deepEqual(room.action('p1', 'circuit', 0, { wire: 0 }), { ok: false, error: 'bad-phase' });
  startGame();
  assert.deepEqual(room.action('p2', 'circuit', 0, { wire: 0 }), { ok: false, error: 'not-cracker' });
  const res = room.action('p1', 'circuit', 0, { wire: 0 });
  assert.equal(res.ok, true);
});

test('round events are forwarded to all; player events carry nicknames', () => {
  const { room, events, joinN, startGame } = mk();
  joinN(2);
  const joined = ofType(events, 'playerJoined');
  assert.equal(joined.length, 2);
  assert.deepEqual(joined[1][1], { playerId: 'p2', nickname: 'Player2' });
  assert.deepEqual(joined[1][2], { to: 'all' });
  startGame();
  room.action('p1', 'circuit', 0, { wire: 0 });
  const last = events.at(-1);
  assert.ok(['strike', 'moduleSolved'].includes(last[0]));
  assert.deepEqual(last[2], { to: 'all' });
});

test('onChange fires on mutations and lastActivityAt advances', () => {
  const { room, clock, joinN, changes } = mk();
  const before = changes();
  joinN(1);
  assert.ok(changes() > before);
  const t0 = room.lastActivityAt;
  clock.advance(1000);
  room.join('p2', 'Two');
  assert.ok(room.lastActivityAt > t0);
});
