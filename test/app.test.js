import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

async function listen() {
  const { httpServer } = createApp();
  await new Promise((r) => httpServer.listen(0, r));
  const { port } = httpServer.address();
  return { httpServer, base: `http://127.0.0.1:${port}` };
}

test('GET /healthz returns 200 ok', async () => {
  const { httpServer, base } = await listen();
  try {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    httpServer.close();
  }
});

test('createApp returns a room manager that can create rooms', () => {
  const { rooms, httpServer } = createApp();
  const room = rooms.create();
  assert.match(room.code, /^[A-Z]{4}$/);
  assert.equal(rooms.get(room.code), room);
  httpServer.close();
});

test('GET / serves the client html', async () => {
  const { httpServer, base } = await listen();
  try {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Vault Crew/);
  } finally {
    httpServer.close();
  }
});
