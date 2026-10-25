import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/rng.js';
import { createFakeClock } from './fakeClock.js';
import { DEFAULT_TIMINGS, ROOM_IDLE_MS, ROOM_SWEEP_MS } from '../server/constants.js';
import { RoomManager } from '../server/rooms.js';

function mk() {
  const clock = createFakeClock(1000);
  const changed = [];
  const events = [];
  const rooms = new RoomManager({
    rng: createRng(2),
    clock,
    timings: DEFAULT_TIMINGS,
    onChange: (room) => changed.push(room.code),
    onEvent: (room, type, data, opts) => events.push([room.code, type, data, opts]),
  });
  return { rooms, clock, changed, events };
}

test('create gives unique 4-letter codes; get normalizes " abcd "', () => {
  const { rooms } = mk();
  const a = rooms.create();
  const b = rooms.create();
  assert.match(a.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  assert.notEqual(a.code, b.code);
  assert.equal(rooms.get(` ${a.code.toLowerCase()} `), a);
  assert.equal(rooms.get('ZZZZ'), undefined);
  assert.equal(rooms.size, 2);
});

test('onChange and onEvent receive the room', () => {
  const { rooms, changed, events } = mk();
  const room = rooms.create();
  room.join('p1', 'One');
  assert.ok(changed.includes(room.code));
  assert.equal(events.at(-1)[0], room.code);
  assert.equal(events.at(-1)[1], 'playerJoined');
});

test('a room that becomes empty is removed on change', () => {
  const { rooms } = mk();
  const room = rooms.create();
  room.join('p1', 'One');
  room.leave('p1');
  assert.equal(rooms.get(room.code), undefined);
});

test('sweepIdle removes rooms idle longer than ROOM_IDLE_MS and runs on a schedule', () => {
  const { rooms, clock } = mk();
  const stale = rooms.create();
  stale.join('p1', 'One');
  clock.advance(ROOM_IDLE_MS - ROOM_SWEEP_MS);
  const fresh = rooms.create();
  fresh.join('p2', 'Two');
  clock.advance(ROOM_SWEEP_MS + 1);
  assert.equal(rooms.get(stale.code), undefined);
  assert.equal(rooms.get(fresh.code), fresh);
});

test('remove deletes a room and frees its code', () => {
  const { rooms } = mk();
  const room = rooms.create();
  rooms.remove(room.code);
  assert.equal(rooms.get(room.code), undefined);
  assert.equal(rooms.size, 0);
});
