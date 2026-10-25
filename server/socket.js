// Socket.IO layer: maps sockets to players, authenticates every message, and
// pushes each player their own snapshot whenever a room changes.
//
// A socket is bound to a player only by a successful create/join/resume on
// that connection. The server generates playerIds; the client never picks one.

import { randomUUID } from 'node:crypto';
import { snapshotFor } from './views.js';

export function attachSockets({ io, rooms, hooks, clock }) {
  // `${code}:${playerId}` → the one live socket for that player.
  const socketsByPlayer = new Map();
  const keyOf = (code, playerId) => `${code}:${playerId}`;

  function sendState(room, playerId) {
    const socket = socketsByPlayer.get(keyOf(room.code, playerId));
    if (!socket) return;
    const snapshot = snapshotFor(room, playerId, clock.now());
    if (snapshot) socket.emit('state', snapshot);
  }

  hooks.onChange = (room) => {
    for (const p of room.players) sendState(room, p.playerId);
  };

  hooks.onEvent = (room, type, data) => {
    io.to(room.code).emit('event', { type, ...data });
  };

  io.on('connection', (socket) => {
    socket.data = { playerId: null, code: null, authenticated: false };

    function bind(room, playerId) {
      const key = keyOf(room.code, playerId);
      const previous = socketsByPlayer.get(key);
      if (previous && previous !== socket) unbind(previous);
      socket.data = { playerId, code: room.code, authenticated: true };
      socket.join(room.code);
      socketsByPlayer.set(key, socket);
    }

    function unbind(target) {
      const { code, playerId } = target.data;
      if (code) target.leave(code);
      if (socketsByPlayer.get(keyOf(code, playerId)) === target) socketsByPlayer.delete(keyOf(code, playerId));
      target.data = { playerId: null, code: null, authenticated: false };
    }

    const ackOf = (ack) => (typeof ack === 'function' ? ack : () => {});

    // Wraps a handler so it only runs for an authenticated socket whose room
    // and player still exist.
    const guarded = (handler) => (payload, ack) => {
      ack = ackOf(ack);
      if (!socket.data.authenticated) return ack({ ok: false, error: 'unauthorized' });
      const room = rooms.get(socket.data.code);
      if (!room || !room.playersById.has(socket.data.playerId)) {
        unbind(socket);
        socket.emit('room:gone');
        return ack({ ok: false, error: 'gone' });
      }
      return handler(room, payload && typeof payload === 'object' ? payload : {}, ack);
    };

    socket.on('room:create', (payload, ack) => {
      ack = ackOf(ack);
      const nickname = payload && payload.nickname;
      const room = rooms.create();
      const playerId = randomUUID();
      const res = room.join(playerId, nickname);
      if (!res.ok) {
        rooms.remove(room.code);
        return ack(res);
      }
      bind(room, playerId);
      ack({ ok: true, code: room.code, playerId, resumeToken: res.resumeToken });
      sendState(room, playerId);
    });

    socket.on('room:join', (payload, ack) => {
      ack = ackOf(ack);
      const { code, nickname } = payload || {};
      const room = rooms.get(code);
      if (!room) return ack({ ok: false, error: 'not-found' });
      const playerId = randomUUID();
      const res = room.join(playerId, nickname);
      if (!res.ok) return ack(res);
      bind(room, playerId);
      ack({ ok: true, code: room.code, playerId, resumeToken: res.resumeToken });
      sendState(room, playerId);
    });

    socket.on('room:resume', (payload, ack) => {
      ack = ackOf(ack);
      const { code, playerId, resumeToken } = payload || {};
      const room = rooms.get(code);
      if (!room) {
        socket.emit('room:gone');
        return ack({ ok: false, error: 'gone' });
      }
      if (!room.authenticate(playerId, resumeToken)) return ack({ ok: false, error: 'unauthorized' });
      bind(room, playerId);
      room.reconnect(playerId);
      ack({ ok: true });
    });

    socket.on('room:leave', guarded((room, _payload, ack) => {
      const { playerId } = socket.data;
      unbind(socket);
      room.leave(playerId);
      ack({ ok: true });
    }));

    socket.on('game:start', guarded((room, _payload, ack) => ack(room.start(socket.data.playerId))));
    socket.on('round:next', guarded((room, _payload, ack) => ack(room.next(socket.data.playerId))));
    socket.on('match:rematch', guarded((room, _payload, ack) => ack(room.rematch(socket.data.playerId))));

    socket.on('module:action', guarded((room, { moduleId, seq, action }, ack) => {
      ack(room.action(socket.data.playerId, moduleId, seq, action));
    }));

    socket.on('time:ping', (payload, ack) => {
      ackOf(ack)({ t0: payload && payload.t0, serverNow: clock.now() });
    });

    socket.on('disconnect', () => {
      if (!socket.data.authenticated) return;
      const { code, playerId } = socket.data;
      if (socketsByPlayer.get(keyOf(code, playerId)) !== socket) return;
      socketsByPlayer.delete(keyOf(code, playerId));
      const room = rooms.get(code);
      if (room) room.disconnect(playerId);
    });
  });
}
