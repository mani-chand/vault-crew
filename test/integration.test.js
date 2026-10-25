// Real server, real Socket.IO clients, shortened timings. Answers are read
// white-box from the server's in-memory round; nothing on the wire carries them.

import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { DEFAULT_TIMINGS } from '../server/constants.js';
import { MODULE_IDS } from '../server/modules/index.js';

const timings = { ...DEFAULT_TIMINGS, REVEAL_MS: 20, ROUND_MS: 2500, SHUFFLE_AT_MS: [600, 1200, 1800] };

let app;
let url;
const open = [];

before(async () => {
  app = createApp({ timings, seed: 42 });
  await new Promise((r) => app.httpServer.listen(0, r));
  url = `http://127.0.0.1:${app.httpServer.address().port}`;
});

after(() => {
  app.io.close();
  app.httpServer.close();
});

afterEach(() => {
  for (const c of open.splice(0)) c.socket.disconnect();
});

// A client wrapper that records every state and event it receives.
function client() {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  const c = { socket, states: [], events: [], gone: 0 };
  socket.on('state', (s) => c.states.push(s));
  socket.on('event', (e) => c.events.push(e));
  socket.on('room:gone', () => { c.gone += 1; });
  c.call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
  c.last = () => c.states.at(-1);
  c.waitFor = (pred, label = 'state', ms = 4000) =>
    new Promise((resolve, reject) => {
      const found = c.states.find(pred);
      if (found) return resolve(found);
      const timer = setTimeout(() => { socket.off('state', on); reject(new Error(`timeout waiting for ${label}`)); }, ms);
      const on = (s) => { if (pred(s)) { clearTimeout(timer); socket.off('state', on); resolve(s); } };
      socket.on('state', on);
    });
  c.waitEvent = (type, ms = 4000) =>
    new Promise((resolve, reject) => {
      const found = c.events.find((e) => e.type === type);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error(`timeout waiting for event ${type}`)), ms);
      const on = (e) => { if (e.type === type) { clearTimeout(timer); socket.off('event', on); resolve(e); } };
      socket.on('event', on);
    });
  open.push(c);
  return c;
}

async function lobby(n) {
  const host = client();
  const created = await host.call('room:create', { nickname: 'Host' });
  assert.equal(created.ok, true);
  const others = [];
  for (let i = 2; i <= n; i++) {
    const c = client();
    const joined = await c.call('room:join', { code: created.code, nickname: `Crew${i}` });
    assert.equal(joined.ok, true, `join ${i}`);
    c.session = { code: created.code, playerId: joined.playerId, resumeToken: joined.resumeToken };
    others.push(c);
  }
  host.session = { code: created.code, playerId: created.playerId, resumeToken: created.resumeToken };
  return { host, others, all: [host, ...others], code: created.code };
}

async function startRound(group) {
  assert.deepEqual(await group.host.call('game:start', {}), { ok: true });
  for (const c of group.all) await c.waitFor((s) => s.phase === 'round', 'round');
  const room = app.rooms.get(group.code);
  const crackerId = room.round.crackerId;
  const cracker = group.all.find((c) => c.session.playerId === crackerId);
  const crew = group.all.filter((c) => c !== cracker);
  return { room, cracker, crew };
}

const uncut = (p) => p.view.wires.map((_, i) => i).filter((i) => !p.view.wires[i].cut);

async function solveAll(cracker, room) {
  const act = (moduleId, action) => cracker.call('module:action', { moduleId, seq: room.round.seqOf(moduleId), action });
  const p = room.round.puzzles;
  let res;
  res = await act('circuit', { wire: uncut(p.circuit)[p.circuit.secret.cutIndex] });
  assert.deepEqual(res, { ok: true, result: 'solved' });
  for (const s of p.tumbler.secret.sequence) res = await act('tumbler', { number: s.number, dir: s.dir });
  assert.deepEqual(res, { ok: true, result: 'solved' });
  for (const g of p.glyphpad.secret.order) res = await act('glyphpad', { glyph: g });
  assert.deepEqual(res, { ok: true, result: 'solved' });
  for (const c of p.pulse.secret.presses) res = await act('pulse', { color: c });
  assert.deepEqual(res, { ok: true, result: 'solved' });
}

function assertIsolation(c, role) {
  for (const s of c.states) {
    const json = JSON.stringify(s);
    assert.equal(json.includes('"secret"'), false, `${role} state carries secret`);
    assert.equal(json.includes('resumeToken'), false, `${role} state carries token`);
    if (s.you.role !== 'cracker') assert.equal(s.cracker, null, `${role} received cracker modules`);
    if (s.you.role === 'cracker') assert.equal(s.crew, null, 'cracker received crew pages');
  }
  for (const e of c.events) {
    const json = JSON.stringify(e);
    assert.equal(json.includes('"secret"'), false);
    assert.equal(json.includes('manual'), false, `${role} event carries manual`);
  }
}

test('two players create, join, start, and the cracker opens the vault', async () => {
  const group = await lobby(2);
  const { room, cracker, crew } = await startRound(group);
  assert.equal(cracker.last().you.role, 'cracker');
  assert.equal(crew[0].last().you.role, 'crew');
  assert.equal(crew[0].last().crew.pages.length, 4);
  await solveAll(cracker, room);
  const s = await cracker.waitFor((x) => x.phase === 'roundResult', 'roundResult');
  assert.equal(s.round.result, 'opened');
  assert.equal(s.match.rounds[0].result, 'opened');
  await crew[0].waitEvent('ended');
  assertIsolation(crew[0], 'crew');
  assertIsolation(cracker, 'cracker');
});

test('crew sending module:action gets not-cracker; unauthenticated socket gets unauthorized', async () => {
  const group = await lobby(2);
  const { crew } = await startRound(group);
  assert.deepEqual(await crew[0].call('module:action', { moduleId: 'circuit', seq: 0, action: { wire: 0 } }), { ok: false, error: 'not-cracker' });
  const stranger = client();
  assert.deepEqual(await stranger.call('module:action', { moduleId: 'circuit', seq: 0, action: { wire: 0 } }), { ok: false, error: 'unauthorized' });
  assert.deepEqual(await stranger.call('game:start', {}), { ok: false, error: 'unauthorized' });
  assert.equal(stranger.states.length, 0);
});

test('reconnect with playerId + resumeToken during round restores role and pages', async () => {
  const group = await lobby(2);
  const { crew } = await startRound(group);
  const version = crew[0].last().round.assignmentVersion;
  crew[0].socket.disconnect();
  const again = client();
  const res = await again.call('room:resume', crew[0].session);
  assert.deepEqual(res, { ok: true });
  const s = await again.waitFor((x) => x.phase === 'round', 'resumed state');
  assert.equal(s.you.role, 'crew');
  assert.equal(s.you.connected, true);
  assert.equal(s.crew.pages.length, 4);
  assert.equal(s.round.assignmentVersion, version);
  assert.equal(s.players.length, 2);
});

test("resume with another player's playerId but wrong token → unauthorized; no state ever sent", async () => {
  const group = await lobby(2);
  const { cracker, crew } = await startRound(group);
  const thief = client();
  const res = await thief.call('room:resume', { code: group.code, playerId: cracker.session.playerId, resumeToken: crew[0].session.resumeToken });
  assert.deepEqual(res, { ok: false, error: 'unauthorized' });
  assert.deepEqual(await thief.call('module:action', { moduleId: 'circuit', seq: 0, action: { wire: 0 } }), { ok: false, error: 'unauthorized' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(thief.states.length, 0);
});

test('unknown room on resume gets room:gone', async () => {
  const c = client();
  const res = await c.call('room:resume', { code: 'ZZZZ', playerId: 'x', resumeToken: 'y' });
  assert.deepEqual(res, { ok: false, error: 'gone' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(c.gone, 1);
});

test('join errors: not-found, bad-name, name-taken; time:ping answers without auth', async () => {
  const c = client();
  assert.deepEqual(await c.call('room:join', { code: 'QQQQ', nickname: 'Ab' }), { ok: false, error: 'not-found' });
  const created = await c.call('room:create', { nickname: 'x' });
  assert.deepEqual(created, { ok: false, error: 'bad-name' });
  const host = client();
  const made = await host.call('room:create', { nickname: 'Sam' });
  assert.deepEqual(await c.call('room:join', { code: made.code.toLowerCase(), nickname: ' sam ' }), { ok: false, error: 'name-taken' });
  const pong = await c.call('time:ping', { t0: 123 });
  assert.equal(pong.t0, 123);
  assert.equal(typeof pong.serverNow, 'number');
});

test('3 players: scheduled shuffle changes crew pages; both crew get the same shuffleId; cracker gets the event but no pages', async () => {
  const group = await lobby(3);
  const { cracker, crew } = await startRound(group);
  const before = crew.map((c) => c.last().crew.pages.map((p) => p.moduleId).sort());
  const ev = await Promise.all(crew.map((c) => c.waitEvent('shuffle')));
  assert.equal(ev[0].shuffleId, ev[1].shuffleId);
  assert.equal(ev[0].assignmentVersion, 2);
  assert.equal(ev[0].reason, 'scheduled');
  for (const c of crew) await c.waitFor((s) => s.round && s.round.assignmentVersion === 2, 'v2');
  const after = crew.map((c) => c.last().crew.pages.map((p) => p.moduleId).sort());
  assert.notDeepEqual(after, before);
  assert.deepEqual(after.flat().sort(), [...MODULE_IDS].sort());
  const crackerEv = await cracker.waitEvent('shuffle');
  assert.equal(crackerEv.shuffleId, ev[0].shuffleId);
  assert.equal(cracker.last().crew, null);
  for (const c of crew) assertIsolation(c, 'crew');
});

test('6 players: exactly one lookout; four hold one page each; after a shuffle the lookout changes', async () => {
  const group = await lobby(6);
  const { crew } = await startRound(group);
  const roles = crew.map((c) => c.last().you.role);
  assert.equal(roles.filter((r) => r === 'lookout').length, 1);
  assert.equal(roles.filter((r) => r === 'crew').length, 4);
  const lookout = crew.find((c) => c.last().you.role === 'lookout');
  assert.equal(lookout.last().crew, null);
  assert.equal(lookout.last().cracker, null);
  for (const c of crew.filter((x) => x !== lookout)) assert.equal(c.last().crew.pages.length, 1);
  await lookout.waitEvent('shuffle');
  for (const c of crew) await c.waitFor((s) => s.round && s.round.assignmentVersion === 2, 'v2');
  assert.equal(lookout.last().you.role, 'crew');
  assert.equal(crew.filter((c) => c.last().you.role === 'lookout').length, 1);
});

test('payload isolation across 6 sockets for a whole round', async () => {
  const group = await lobby(6);
  const { cracker, crew } = await startRound(group);
  await cracker.waitFor((s) => s.phase === 'roundResult', 'roundResult', 5000);
  assertIsolation(cracker, 'cracker');
  for (const c of crew) assertIsolation(c, 'crew');
  const names = new Set(cracker.last().players.map((p) => p.nickname));
  assert.equal(names.size, 6);
});

test('a socket that creates a second room is detached from its first seat instead of leaving a ghost', async () => {
  const c = client();
  const a = await c.call('room:create', { nickname: 'Ann' });
  assert.equal(a.ok, true);
  const b = await c.call('room:create', { nickname: 'Ann' });
  assert.equal(b.ok, true);
  const roomA = app.rooms.get(a.code);
  assert.equal(roomA.players.length, 1);
  assert.equal(roomA.players[0].connected, false, 'old seat must enter grace, not stay "connected"');

  const bob = client();
  assert.equal((await bob.call('room:join', { code: a.code, nickname: 'Bob' })).ok, true);
  await bob.waitFor((s) => s.players.length === 2, 'bob sees two');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(c.states.some((s) => s.code === a.code && s.players.length === 2), false, 'socket still receives room A state');
  assert.equal(c.last().code, b.code);
});

test('room:leave removes the player and the socket stops receiving state', async () => {
  const group = await lobby(3);
  assert.deepEqual(await group.others[1].call('room:leave', {}), { ok: true });
  await group.host.waitFor((s) => s.players.length === 2, 'two players');
  const n = group.others[1].states.length;
  await group.others[0].call('room:leave', {});
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(group.others[1].states.length, n);
  assert.deepEqual(await group.others[1].call('game:start', {}), { ok: false, error: 'unauthorized' });
});
