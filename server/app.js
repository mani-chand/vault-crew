import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { DEFAULT_TIMINGS, realClock } from './constants.js';
import { createRng } from './rng.js';
import { RoomManager } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ clock = realClock, timings = DEFAULT_TIMINGS, seed = Date.now() } = {}) {
  const app = express();
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  // Socket wiring (per-player snapshots, events) is attached in socket.js.
  const hooks = { onChange: () => {}, onEvent: () => {} };
  const rooms = new RoomManager({
    rng: createRng(seed),
    clock,
    timings,
    onChange: (room) => hooks.onChange(room),
    onEvent: (room, type, data, opts) => hooks.onEvent(room, type, data, opts),
  });

  return { httpServer, io, rooms, hooks };
}
