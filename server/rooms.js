// All live rooms, keyed by code. Rooms are in-memory only; a restart loses
// them, and the client says so honestly.

import { Room } from './room.js';
import { generateCode, normalizeCode } from './roomCodes.js';

export class RoomManager {
  constructor({ rng, clock, timings, onChange, onEvent }) {
    this.rng = rng;
    this.clock = clock;
    this.timings = timings;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.rooms = new Map();
    this.scheduleSweep();
  }

  get size() {
    return this.rooms.size;
  }

  create() {
    const code = generateCode(this.rng, new Set(this.rooms.keys()));
    const room = new Room({
      code,
      rng: this.rng,
      clock: this.clock,
      timings: this.timings,
      onChange: () => this.roomChanged(room),
      onEvent: (type, data, opts) => this.onEvent(room, type, data, opts),
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(normalizeCode(code));
  }

  remove(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    room.destroy();
  }

  roomChanged(room) {
    this.onChange(room);
    if (room.players.length === 0) this.remove(room.code);
  }

  sweepIdle() {
    const now = this.clock.now();
    for (const room of [...this.rooms.values()]) {
      const idle = now - room.lastActivityAt;
      const empty = room.players.length === 0;
      if (idle >= this.timings.ROOM_IDLE_MS || (empty && idle >= this.timings.ROOM_SWEEP_MS)) {
        this.remove(room.code);
      }
    }
  }

  scheduleSweep() {
    this.clock.setTimeout(() => {
      this.sweepIdle();
      this.scheduleSweep();
    }, this.timings.ROOM_SWEEP_MS);
  }
}
