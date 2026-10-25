import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { DEFAULT_TIMINGS, realClock } from './constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ clock = realClock, timings = DEFAULT_TIMINGS, seed } = {}) {
  const app = express();
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  // Room manager and socket wiring arrive in later tasks.
  void clock; void timings; void seed;
  return { httpServer, io, rooms: null };
}
