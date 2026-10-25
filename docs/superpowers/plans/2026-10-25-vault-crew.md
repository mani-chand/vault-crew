# Vault Crew Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable 2–6 player real-time co-op heist game: one Cracker sees four puzzle modules, the Crew holds the manual pages, pages shuffle between Crew phones every 60 s, server owns everything.

**Architecture:** One Node process. Pure game logic (`server/modules`, `assignment`, `scoring`, `round`, `match`, `room`) takes an injectable clock and RNG so every rule is unit-tested without sockets or real time. A thin Socket.IO layer maps sockets to players and pushes a full role-specific snapshot to every player on every change. The vanilla-JS client is a single `render(state)` function per screen plus animations driven by discrete `event` messages.

**Tech Stack:** Node 22, Express 4, Socket.IO 4 (server + bundled client), vanilla HTML/CSS/JS ES modules, `node --test`, `socket.io-client` (dev, integration test), Render free web service.

**Spec:** `docs/superpowers/specs/2026-10-25-vault-crew-design.md`

## Global Constraints

- Node 22, `"type": "module"`, no bundler, no framework, no build step. Client is static files under `public/` plus `/shared` served as-is.
- Puzzle answers never leave the server. Any payload sent to a socket goes through `views.js`; no other file emits puzzle data.
- Timer: `ROUND_MS = 240000`, `SHUFFLE_AT_MS = [60000, 120000, 180000]`, `SHUFFLE_WARN_MS = 5000`, `REVEAL_MS = 3000`, `NEXT_FALLBACK_MS = 10000`, `GRACE_CREW_MS = 60000`, `GRACE_CRACKER_MS = 30000`, `ROOM_IDLE_MS = 1800000`, `STRIKES_MAX = 3`, `ROUNDS_TOTAL = 5`. All in `server/constants.js`; all overridable through the `timings` option for tests.
- Players 2–6. Nickname 2–12 chars after trim, unique per room case-insensitively. Room code 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, O; digits never used).
- Scoring: opened round = `1000 + 5 * floor(timeLeftMs / 1000) - 150 * strikes`; locked or timeout = 0.
- No bomb/defuse imagery or language anywhere in copy, art, or identifiers. Module names: Circuit Bank, Tumbler, Glyph Pad, Pulse. Module ids: `circuit`, `tumbler`, `glyphpad`, `pulse`.
- Rules screen copy, verbatim: "Cracker: say what you see. Crew: say what to do. Nobody reads anyone else's screen. Four modules, four minutes, three strikes. Every minute the Crew's pages swap."
- Colour never the only signal: every coloured wire/button/dot also carries a text label.
- Commits: plain imperative messages, no attribution trailers.

## Review Focus

1. Nickname containing HTML (`<b>hi</b>`) or emoji: must be stored verbatim, rendered as text (never innerHTML), and counted by code points. Test pinned in Task 10.
2. Room code typed lowercase or with spaces (` abcd `): must join `ABCD`. Test pinned in Task 10.
3. Cracker double-taps a module control: second tap carries the same `step`, must be ignored, exactly one strike or one advance. Test pinned in Task 8.
4. Any action after the round ended (timeout fires while a tap is in flight) or on an already-solved module: rejected, no strike, no crash. Test pinned in Task 8.
5. Phone screen locks for 20 s mid-round then wakes: socket reconnects with the same `playerId`, player never shows as removed, receives current `assignmentVersion` pages. Test pinned in Task 11 (integration).

---

## File structure

```
package.json                 scripts: start, test; deps express, socket.io; dev socket.io-client
render.yaml                  Render blueprint
server/
  constants.js               timings and limits (see Global Constraints)
  rng.js                     mulberry32 seeded RNG
  roomCodes.js               code alphabet + generator
  modules/glyphs.js          re-export of shared/glyphs.js ids for server use
  modules/circuit.js         Circuit Bank
  modules/tumbler.js         Tumbler
  modules/glyphpad.js        Glyph Pad
  modules/pulse.js           Pulse
  modules/index.js           MODULES registry + generateManuals/generatePuzzles helpers
  assignment.js              page distribution + fairness
  scoring.js                 round score + awards
  round.js                   one round's state machine (timer, strikes, shuffles)
  match.js                   five rounds, cracker rotation, summary
  room.js                    players, host, grace, phases; owns Match + Round
  rooms.js                   RoomManager (code → Room, idle cleanup)
  views.js                   role-specific snapshot builders (the only place puzzle data is shaped for clients)
  socket.js                  Socket.IO handlers
  app.js                     createApp({ clock, timings, rng }) → { httpServer, io, rooms }
  index.js                   listens on PORT
shared/
  glyphs.js                  16 glyph ids, spoken names, SVG paths (ES module used by server and browser)
public/
  index.html                 all screens as <section> elements
  css/style.css
  js/net.js                  socket, playerId/localStorage, clock offset, reconnect state
  js/app.js                  state store, screen router, event dispatcher
  js/screens/join.js         join/create + rules
  js/screens/lobby.js
  js/screens/reveal.js
  js/screens/cracker.js      module tiles + full-screen module controls
  js/screens/crew.js         page tabs, manual rendering, shuffle countdown/flash
  js/screens/lookout.js
  js/screens/results.js      round result + final + copy summary
  js/manual.js               renders a manual page object → DOM (used by crew.js)
  js/modules/circuit.js      cracker controls for each module
  js/modules/tumbler.js
  js/modules/glyphpad.js
  js/modules/pulse.js
  js/sound.js
  js/dom.js                  h(), el(), text helpers
test/
  fakeClock.js               controllable clock for round/room tests
  *.test.js                  one per server file, plus integration.test.js
README.md
```

Shared type vocabulary (used across tasks):

```js
// Clock (injected everywhere timers are used)
{ now(): number, setTimeout(fn, ms): handle, clearTimeout(handle): void }

// Rng — see Task 2
// Manual — per-module object, fixed per match; shape per module in Tasks 3–6
// Puzzle — { view, progress, secret }   // view+progress → cracker; secret never leaves server
// ValidateResult — { result: 'ok' | 'strike' | 'solved' }
// Assignment — { [playerId]: string[] /* moduleIds */ }   plus lookoutId
// RoundResult — 'opened' | 'locked' | 'timeout'
```

---

### Task 1: Project scaffold, health endpoint, Render blueprint

**Files:**
- Create: `package.json`, `.gitignore`, `server/constants.js`, `server/app.js`, `server/index.js`, `render.yaml`, `public/index.html`, `test/app.test.js`

**Interfaces:**
- Produces: `createApp({ clock = realClock, timings = DEFAULT_TIMINGS, seed } = {}) → { httpServer, io, rooms }` in `server/app.js`. `rooms` is wired in Task 10; until then return `null` for it. `server/constants.js` exports every constant in Global Constraints plus `DEFAULT_TIMINGS` (an object of the `*_MS` values) and `realClock`.

- [ ] **Step 1: Write the failing test**

```js
// test/app.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

test('GET /healthz returns 200 ok', async () => {
  const { httpServer } = createApp();
  await new Promise(r => httpServer.listen(0, r));
  const { port } = httpServer.address();
  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  httpServer.close();
});

test('GET / serves the client html', async () => {
  const { httpServer } = createApp();
  await new Promise(r => httpServer.listen(0, r));
  const { port } = httpServer.address();
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Vault Crew/);
  httpServer.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot find module `../server/app.js`

- [ ] **Step 3: Create `package.json`**

`"type": "module"`, `"engines": { "node": ">=22" }`, scripts `start: node server/index.js`, `test: node --test`, deps `express@^4.21`, `socket.io@^4.8`, devDeps `socket.io-client@^4.8`. Run `npm install`. `.gitignore`: `node_modules/`.

- [ ] **Step 4: Implement `server/constants.js`, `server/app.js`, `server/index.js`, placeholder `public/index.html`**

`createApp` builds an Express app with `express.static('public')`, `express.static('shared')` mounted at `/shared`, `GET /healthz → { ok: true }`, wraps it in `http.createServer`, attaches `new Server(httpServer)` from socket.io. `index.js` calls `createApp()` and listens on `process.env.PORT || 3000` on `0.0.0.0`. `index.html` is a minimal page whose `<title>` is `Vault Crew`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: 2 passing

- [ ] **Step 6: Write `render.yaml`**

```yaml
services:
  - type: web
    name: vault-crew
    runtime: node
    plan: free
    buildCommand: npm ci
    startCommand: npm start
    healthCheckPath: /healthz
    envVars:
      - key: NODE_VERSION
        value: "22"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Scaffold server with health endpoint and Render blueprint"
```

---

### Task 2: Seeded RNG and room codes

**Files:**
- Create: `server/rng.js`, `server/roomCodes.js`, `test/rng.test.js`, `test/roomCodes.test.js`

**Interfaces:**
- Produces: `createRng(seed: number) → Rng` where `Rng = { next(): number /* [0,1) */, int(min, max): number /* inclusive */, pick(arr), shuffle(arr) /* returns new array */, sample(arr, n) /* n distinct */ }`. `generateCode(rng, taken: Set<string>) → string`. `normalizeCode(input: string) → string` (trim, uppercase). `CODE_ALPHABET`.

- [ ] **Step 1: Write the failing tests**

```js
// test/rng.test.js
test('same seed gives same sequence', () => {
  const a = createRng(42), b = createRng(42);
  assert.deepEqual([a.next(), a.next()], [b.next(), b.next()]);
});
test('int is inclusive of both bounds over many draws', () => {
  const r = createRng(1); const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(r.int(1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});
test('sample returns n distinct elements', () => {
  const s = createRng(7).sample([1,2,3,4,5,6], 4);
  assert.equal(s.length, 4); assert.equal(new Set(s).size, 4);
});

// test/roomCodes.test.js
test('code is 4 letters from alphabet without I or O', () => {
  const code = generateCode(createRng(3), new Set());
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
});
test('generateCode avoids taken codes', () => {
  const rng = createRng(3);
  const first = generateCode(createRng(3), new Set());
  const second = generateCode(rng, new Set([first]));
  assert.notEqual(second, first);
});
test('normalizeCode trims and uppercases', () => {
  assert.equal(normalizeCode(' abcd '), 'ABCD');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, modules not found

- [ ] **Step 3: Implement `server/rng.js` (mulberry32) and `server/roomCodes.js`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add server/rng.js server/roomCodes.js test/rng.test.js test/roomCodes.test.js
git commit -m "Add seeded rng and room code generator"
```

---

### Task 3: Shared glyphs and Circuit Bank module

**Files:**
- Create: `shared/glyphs.js`, `server/modules/circuit.js`, `test/modules/circuit.test.js`

**Interfaces:**
- Produces `shared/glyphs.js`: `export const GLYPHS = [{ id, name, path }]` — exactly 16 entries, ids: `triangle, square, circle, diamond, star, hexagon, cross, arrow, moon, bolt, wave, spiral, heart, anchor, key, eye`; `name` is the spoken name (capitalised id); `path` is an SVG path string in a 0 0 24 24 viewBox. `export const GLYPH_IDS`.
- Produces the **module interface** every module file exports, used by Tasks 4–8:
  ```js
  export const id, name;
  export function generateManual(rng) → Manual
  export function generatePuzzle(rng, manual) → Puzzle  // { view, progress, secret }
  export function solve(view, manual) → Answer          // reference solver, same shape as secret
  export function validate(puzzle, action) → { result: 'ok'|'strike'|'solved' }  // mutates puzzle.progress and puzzle.view
  ```
- Circuit shapes: `Manual = { rules: string[] /* 5 strings, verbatim from spec */ }`. `view = { wires: [{ color, cut: boolean }], voltage }` with 4–6 wires, colors from `['red','blue','yellow','green','white']`, voltage 1–9. `secret = { cutIndex }` = index into the **uncut** wires list per the rules. `progress = {}`. `action = { wire: number }` (index into `view.wires`).

- [ ] **Step 1: Write the failing tests**

```js
// test/modules/circuit.test.js
import * as circuit from '../../server/modules/circuit.js';
const manual = circuit.generateManual(createRng(1));
const solveWires = (colors, voltage) => circuit.solve({ wires: colors.map(c => ({ color: c, cut: false })), voltage }, manual);

test('rule 1: no red → second wire', () => assert.equal(solveWires(['blue','green','white','yellow'], 5), 1));
test('rule 2: even voltage with blue → last blue', () => assert.equal(solveWires(['red','blue','green','blue','white'], 4), 3));
test('rule 3: more than one yellow → first yellow', () => assert.equal(solveWires(['red','yellow','green','yellow'], 3), 1));
test('rule 4: exactly one white → wire below it', () => assert.equal(solveWires(['red','white','green','yellow'], 3), 2));
test('rule 4 wraps when white is last', () => assert.equal(solveWires(['red','green','yellow','white'], 3), 0));
test('rule 5: voltage mod count, 0 means last', () => {
  assert.equal(solveWires(['red','green','green','green'], 3), 2);
  assert.equal(solveWires(['red','green','green','green'], 8), 3);
});
test('generated puzzles are self-consistent across 500 seeds', () => {
  for (let s = 0; s < 500; s++) {
    const p = circuit.generatePuzzle(createRng(s), manual);
    assert.equal(p.secret.cutIndex, circuit.solve(p.view, manual));
    assert.ok(p.view.wires.length >= 4 && p.view.wires.length <= 6);
  }
});
test('wrong cut strikes, stays cut, and answer re-derives from remaining wires', () => {
  const p = circuit.generatePuzzle(createRng(5), manual);
  const wrong = (p.secret.cutIndex + 1) % p.view.wires.length;
  assert.deepEqual(circuit.validate(p, { wire: wrong }), { result: 'strike' });
  assert.equal(p.view.wires[wrong].cut, true);
  const remaining = p.view.wires.filter(w => !w.cut);
  const expected = circuit.solve({ wires: remaining, voltage: p.view.voltage }, manual);
  assert.equal(p.secret.cutIndex, expected);
});
test('correct cut solves', () => {
  const p = circuit.generatePuzzle(createRng(5), manual);
  const uncut = p.view.wires.map((w, i) => i).filter(i => !p.view.wires[i].cut);
  assert.deepEqual(circuit.validate(p, { wire: uncut[p.secret.cutIndex] }), { result: 'solved' });
});
test('cutting an already-cut wire is ok (ignored), no strike', () => {
  const p = circuit.generatePuzzle(createRng(5), manual);
  const wrong = (p.secret.cutIndex + 1) % p.view.wires.length;
  circuit.validate(p, { wire: wrong });
  assert.deepEqual(circuit.validate(p, { wire: wrong }), { result: 'ok' });
});
test('rule spread: no single rule answers more than 45% of 1000 puzzles', () => { /* count which rule index fired via circuit.whichRule(view, manual); assert max/1000 < 0.45 */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, modules not found

- [ ] **Step 3: Implement `shared/glyphs.js` and `server/modules/circuit.js`**

Also export `whichRule(view, manual) → 1..5` for the spread test. `solve` operates on `view.wires` filtered to uncut and renumbered 1..k. Rule text in `manual.rules` is the five rule strings from the spec, written for a reader ("1. If there are no red wires, cut the 2nd wire." etc.). `generatePuzzle` picks wire count and colors then rejects and regenerates while the resulting rule would push any rule above the spread target — builder's choice of method, test is the contract.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add shared/glyphs.js server/modules/circuit.js test/modules/circuit.test.js
git commit -m "Add shared glyph set and Circuit Bank module"
```

---

### Task 4: Tumbler module

**Files:**
- Create: `server/modules/tumbler.js`, `test/modules/tumbler.test.js`

**Interfaces:**
- Consumes: module interface and `GLYPH_IDS` from Task 3; `Rng` from Task 2.
- Produces: `Manual = { table: [{ glyph, number }] /* 8 entries, distinct glyphs, distinct numbers 0–19 */, directionRule: { green: ['L','R','L'], red: ['R','L','R'] } }`. `view = { glyphs: [id, id, id] /* distinct, from manual */, lamp: 'green'|'red', step: 0|1|2 }`. `secret = { sequence: [{ number, dir }] /* 3 */ }`. `action = { number: 0..19, dir: 'L'|'R' }`.

- [ ] **Step 1: Write the failing tests**

```js
test('manual has 8 distinct glyphs mapped to 8 distinct numbers in 0..19', ...);
test('solve maps glyphs through table and applies lamp direction', () => {
  const manual = { table: [{glyph:'star',number:4},{glyph:'moon',number:17},{glyph:'key',number:0}, /* +5 more */], directionRule: { green:['L','R','L'], red:['R','L','R'] } };
  assert.deepEqual(tumbler.solve({ glyphs:['moon','key','star'], lamp:'red', step:0 }, manual).sequence,
    [{number:17,dir:'R'},{number:0,dir:'L'},{number:4,dir:'R'}]);
});
test('self-consistent across 500 seeds', ...);   // secret equals solve(view)
test('three correct commits solve, step advances in view', () => { /* ok, ok, solved; view.step 1, 2 */ });
test('wrong number strikes and resets step to 0', ...);
test('right number wrong direction strikes', ...);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, module not found

- [ ] **Step 3: Implement `server/modules/tumbler.js`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add server/modules/tumbler.js test/modules/tumbler.test.js
git commit -m "Add Tumbler module"
```

---

### Task 5: Glyph Pad module

**Files:**
- Create: `server/modules/glyphpad.js`, `test/modules/glyphpad.test.js`

**Interfaces:**
- Produces: `Manual = { grid: string[] /* all 16 glyph ids, a permutation, read row-major as 4×4 */ }`. `view = { pad: string[] /* 9 ids */, ringed: string[] /* 4 of pad, in pad order */, lamp: 'white'|'amber', pressed: string[] }`. `secret = { order: string[] /* 4 */ }`. `action = { glyph: id }`.

- [ ] **Step 1: Write the failing tests**

```js
test('manual grid is a permutation of all 16 glyphs', ...);
test('solve orders ringed glyphs by grid position; amber reverses', () => {
  const manual = { grid: GLYPH_IDS /* identity order */ };
  const view = { pad: [...], ringed: ['key','circle','star','triangle'], lamp: 'white', pressed: [] };
  assert.deepEqual(glyphpad.solve(view, manual).order, ['triangle','circle','star','key']);
  assert.deepEqual(glyphpad.solve({ ...view, lamp: 'amber' }, manual).order, ['key','star','circle','triangle']);
});
test('self-consistent across 500 seeds; ringed are all in pad', ...);
test('pressing in order: ok, ok, ok, solved; view.pressed grows', ...);
test('wrong press strikes and clears pressed', ...);
test('pressing an unringed glyph strikes', ...);
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `server/modules/glyphpad.js`**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add server/modules/glyphpad.js test/modules/glyphpad.test.js
git commit -m "Add Glyph Pad module"
```

---

### Task 6: Pulse module and module registry

**Files:**
- Create: `server/modules/pulse.js`, `server/modules/index.js`, `test/modules/pulse.test.js`, `test/modules/index.test.js`

**Interfaces:**
- Pulse: `COLORS = ['red','green','blue','yellow']`. `Manual = { tables: { SLOW: { red: color, ... }, FAST: { ... } } }` — each table a permutation of COLORS with no colour mapping to itself, and SLOW ≠ FAST. `view = { sequence: color[] /* 4, repeats allowed */, tempo: 'SLOW'|'FAST', progress: number }`. `secret = { presses: color[] }`. `action = { color }`.
- Registry (`server/modules/index.js`): `MODULES = { circuit, tumbler, glyphpad, pulse }` keyed by id; `MODULE_IDS = ['circuit','tumbler','glyphpad','pulse']`; `generateManuals(rng) → { [id]: Manual }`; `generatePuzzles(rng, manuals) → { [id]: Puzzle }`.

- [ ] **Step 1: Write the failing tests**

```js
test('tables are derangements of the four colors and SLOW differs from FAST', ...);
test('solve maps each flash through the tempo table', () => {
  const manual = { tables: { SLOW: { red:'blue', blue:'red', green:'yellow', yellow:'green' }, FAST: { red:'green', green:'blue', blue:'yellow', yellow:'red' } } };
  assert.deepEqual(pulse.solve({ sequence:['red','red','yellow','green'], tempo:'FAST', progress:0 }, manual).presses, ['green','green','red','blue']);
});
test('self-consistent across 500 seeds', ...);
test('four correct presses solve; wrong press strikes and resets progress', ...);

// index.test.js
test('generateManuals returns one manual per module id', ...);
test('generatePuzzles returns a puzzle per id whose secret matches solve', ...);
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `server/modules/pulse.js` and `server/modules/index.js`**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add server/modules/pulse.js server/modules/index.js test/modules/pulse.test.js test/modules/index.test.js
git commit -m "Add Pulse module and module registry"
```

---

### Task 7: Page assignment and scoring

**Files:**
- Create: `server/assignment.js`, `server/scoring.js`, `test/assignment.test.js`, `test/scoring.test.js`

**Interfaces:**
- `assignPages(rng, { crewIds: string[], pageIds: string[], previous: Assignment|null, burden: { [playerId]: { double: number, lookout: number } } }) → { assignment: Assignment, lookoutId: string|null, extraHolderId: string|null }`.
  - Sizes: 1 crew → all pages; 2 → 2+2; 3 → 2+1+1; 4 → 1 each; 5 → 1,1,1,1 + lookout; crew > pages+1 is never passed.
  - `extraHolderId` is the crew member with the lowest `burden.double` (ties broken by rng); `lookoutId` the lowest `burden.lookout`.
  - When `previous` is given and crewIds length ≥ 2, the returned assignment must differ from `previous` (as a map of playerId → sorted pages) whenever any different valid assignment exists.
- `roundScore({ result, timeLeftMs, strikes }) → number`.
- `awards(rounds: [{ crackerId, result, timeLeftMs, strikes, score }]) → { mvp: {crackerId, roundIndex}|null, fastest: {...}|null, cleanest: {...}|null }`.

- [ ] **Step 1: Write the failing tests**

```js
// assignment.test.js
const pages = ['circuit','tumbler','glyphpad','pulse'];
const noBurden = ids => Object.fromEntries(ids.map(i => [i, { double: 0, lookout: 0 }]));
test('1 crew gets all four pages, no lookout', ...);
test('2 crew get two pages each', ...);
test('3 crew: one gets two, others one; extraHolder is the one with two', ...);
test('4 crew: one page each', ...);
test('5 crew: four holders and one lookout', ...);
test('extra page goes to the player with lowest double burden', () => {
  const r = assignPages(createRng(1), { crewIds:['a','b','c'], pageIds: pages, previous: null, burden: { a:{double:2,lookout:0}, b:{double:0,lookout:0}, c:{double:1,lookout:0} } });
  assert.equal(r.extraHolderId, 'b');
});
test('lookout goes to the player with lowest lookout burden', ...);
test('reassignment differs from previous for 2..5 crew across 200 seeds', ...);
test('every page assigned exactly once', ...);

// scoring.test.js
test('opened: 1000 + 5*sec - 150*strikes', () => assert.equal(roundScore({ result:'opened', timeLeftMs: 90500, strikes: 1 }), 1300));
test('locked and timeout score 0', ...);
test('awards: mvp highest score, fastest least elapsed, cleanest fewest strikes with faster tiebreak', ...);
test('awards are null when no round opened', ...);
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `server/assignment.js` and `server/scoring.js`**

For "must differ": generate candidate by choosing extra holder/lookout per burden then shuffling pages across holders with rng; if equal to previous, re-shuffle (bounded loop of 50) and finally rotate page order one step. `timeLeftMs` is measured as `endsAt - solvedAt`; `elapsed = ROUND_MS - timeLeftMs`.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add server/assignment.js server/scoring.js test/assignment.test.js test/scoring.test.js
git commit -m "Add page assignment with fairness and round scoring"
```

---

### Task 8: Round state machine

**Files:**
- Create: `server/round.js`, `test/fakeClock.js`, `test/round.test.js`

**Interfaces:**
- Consumes: `generatePuzzles`, `MODULES` (Task 6), `assignPages` (Task 7), `Clock`, `Rng`.
- Produces:
  ```js
  export class Round {
    constructor({ roundIndex, crackerId, crewIds, manuals, burden, rng, clock, timings, onEvent })
    start()                                   // generates puzzles, sets startedAt/endsAt, schedules end + shuffles
    action(playerId, moduleId, step, action) → { ok: true, result } | { ok: false, error: 'not-cracker'|'round-over'|'solved'|'stale'|'bad-module'|'bad-action' }
    setCrew(crewIds)                          // immediate reassign (version++, event 'shuffle' reason 'crewChanged'); no-op if unchanged
    crackerLeft()                             // ends round 'locked'
    end(result)                               // idempotent; clears timers
    get ended, result, strikes, startedAt, endsAt, assignmentVersion, nextShuffleAt
    moduleStatus() → { [id]: 'open'|'solved' }
    crackerModules() → { [id]: { ...view, step } }      // no secret
    pagesFor(playerId) → [{ moduleId, manual }]         // [] for cracker / lookout / unknown
    roleOf(playerId) → 'cracker'|'crew'|'lookout'|null
    summary() → { result, timeLeftMs, strikes, solvedCount, crackerId }
  }
  ```
  `onEvent(type, data)` types: `strike {strikes, moduleId}`, `moduleSolved {moduleId}`, `shuffle {shuffleId, assignmentVersion, reason:'scheduled'|'crewChanged'}`, `ended {result}`. Each module keeps `step` starting at 0 incremented on every accepted action (ok, strike, solved). `shuffleEnabled` is recomputed at each shuffle time as `current crewIds.length >= 2`.
- `test/fakeClock.js`: `createFakeClock(start = 0) → { now, setTimeout, clearTimeout, advance(ms) }` firing due timers in order.

- [ ] **Step 1: Write the failing tests**

```js
const mk = (over = {}) => { const events = []; const clock = createFakeClock(1000); const r = new Round({ roundIndex:0, crackerId:'c', crewIds:['a','b','x'], manuals: generateManuals(createRng(1)), burden: {...}, rng: createRng(2), clock, timings: DEFAULT_TIMINGS, onEvent: (t,d)=>events.push([t,d]), ...over }); r.start(); return { r, clock, events }; };

test('start sets endsAt = startedAt + 240000 and modules open', ...);
test('timeout ends round with result timeout at exactly 240000', () => { clock.advance(239999); assert.equal(r.ended, false); clock.advance(1); assert.equal(r.result, 'timeout'); });
test('non-cracker action rejected not-cracker', ...);
test('stale step ignored: same step sent twice gives one strike', () => {
  const wrongWire = /* derive from r.puzzles.circuit.secret */;
  assert.equal(r.action('c','circuit',0,{wire:wrongWire}).ok, true);
  assert.deepEqual(r.action('c','circuit',0,{wire:wrongWire}), { ok:false, error:'stale' });
  assert.equal(r.strikes, 1);
});
test('third strike locks and emits ended locked', ...);
test('solving all four opens vault; timeLeftMs in summary', ...);   // use secrets white-box to solve
test('action on solved module rejected solved, no strike', ...);
test('action after end rejected round-over', ...);
test('shuffles fire at 60000, 120000, 180000 with increasing version and distinct shuffleId', ...);
test('no shuffle fires after round ended', ...);
test('shuffle skipped when crew count drops below 2, resumes when it grows', ...);
test('setCrew reassigns immediately with reason crewChanged', ...);
test('pagesFor cracker is empty; crackerModules has no secret keys', () => { assert.deepEqual(r.pagesFor('c'), []); for (const m of Object.values(r.crackerModules())) assert.equal('secret' in m, false); });
test('5 crew → one lookout; roleOf returns lookout for them', ...);
test('crackerLeft ends locked', ...);
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `test/fakeClock.js` and `server/round.js`**

`Round` exposes `puzzles` (for white-box tests only; `views.js` must never read it). Timer handles stored so `end()` clears all. `nextShuffleAt` = next unfired scheduled time or null.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add server/round.js test/fakeClock.js test/round.test.js
git commit -m "Add round state machine with timer, strikes and shuffles"
```

---

### Task 9: Match (rounds, rotation, summary)

**Files:**
- Create: `server/match.js`, `test/match.test.js`

**Interfaces:**
- Consumes: `Round` (Task 8), `roundScore`, `awards` (Task 7), `generateManuals` (Task 6).
- Produces:
  ```js
  export class Match {
    constructor({ playerIds /* join order */, crackedCounts: { [id]: number }, rng, clock, timings, onEvent })
    nextCrackerId(presentIds) → string          // least crackedCounts among present, tie → join order; counts include rounds already played this match
    startRound(presentIds) → Round              // roundIndex = rounds played; crew = present minus cracker; carries burden across rounds
    recordRound(round)                           // pushes { roundIndex, crackerId, result, timeLeftMs, strikes, score }; increments crackedCounts[crackerId]
    get roundIndex, isComplete /* 5 recorded */, manuals, rounds, burden, crackedCounts
    summary() → { rounds, total, awards }
  }
  ```

- [ ] **Step 1: Write the failing tests**

```js
test('5 players each crack once in join order', ...);
test('3 players: rotation a,b,c,a,b', ...);
test('crackedCounts from a previous match are honoured: players who never cracked go first', ...);
test('absent scheduled cracker is skipped', ...);
test('manuals are generated once and shared by all rounds', () => { assert.equal(m.startRound(ids).manuals, m.startRound(ids).manuals); });
test('burden carries across rounds so the same player is not extra holder twice when others are at 0', ...);
test('summary totals scores and computes awards', ...);
test('isComplete after five recorded rounds', ...);
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `server/match.js`**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add server/match.js test/match.test.js
git commit -m "Add match with cracker rotation and summary"
```

---

### Task 10: Room, RoomManager, and views

**Files:**
- Create: `server/room.js`, `server/rooms.js`, `server/views.js`, `test/room.test.js`, `test/rooms.test.js`, `test/views.test.js`

**Interfaces:**
- Consumes: `Match`, `Round`, `generateCode`, `normalizeCode`, `Clock`, `Rng`.
- Produces:
  ```js
  // room.js
  export class Room {
    constructor({ code, rng, clock, timings, onChange, onEvent })   // onChange() after any state change; onEvent(type, data, { to: 'all' | playerId[] })
    join(playerId, nickname) → { ok: true } | { ok: false, error: 'full'|'name-taken'|'bad-name' }   // mid-round joiners get joinedMidRound = true
    leave(playerId)                                  // explicit leave: remove immediately
    disconnect(playerId)                             // starts grace (30 s if cracker in active round, else 60 s)
    reconnect(playerId) → boolean                    // cancels grace; false if unknown
    start(byPlayerId) → { ok } | { ok:false, error:'not-host'|'not-enough-players'|'bad-phase' }
    next(byPlayerId) → { ok } | { ok:false, error:'not-allowed'|'bad-phase' }   // host any time; others after NEXT_FALLBACK_MS
    rematch(byPlayerId) → { ok } | ...
    action(playerId, moduleId, step, action) → Round.action result or { ok:false, error:'bad-phase' }
    get phase  // 'lobby'|'reveal'|'round'|'roundResult'|'final'
    get hostId, players /* [{ playerId, nickname, joinOrder, connected, joinedMidRound }] */, match, round, lastActivityAt
    roleOf(playerId) → 'cracker'|'crew'|'lookout'|null
  }
  // rooms.js
  export class RoomManager {
    constructor({ rng, clock, timings, onChange, onEvent })
    create() → Room
    get(code) → Room|undefined          // normalizes code
    remove(code)
    sweepIdle()                         // removes rooms idle > ROOM_IDLE_MS; scheduled every 60 s by constructor
  }
  // views.js
  export function snapshotFor(room, playerId, now) → Snapshot
  ```
  Snapshot shape (the client's whole world):
  ```js
  {
    code, phase, serverNow,
    you: { playerId, nickname, isHost, role, connected },
    players: [{ playerId, nickname, isHost, connected, role }],
    rules: string,                                    // verbatim rules copy
    match: null | { roundIndex, roundsTotal: 5, rounds: [...recorded], total },
    round: null | { roundIndex, crackerId, startedAt, endsAt, durationMs, strikes, strikesMax: 3,
                    modules: { [id]: 'open'|'solved' }, shuffleEnabled, nextShuffleAt, shuffleWarnMs: 5000,
                    assignmentVersion, result, resultAt, nextAllowedAt },
    cracker: null | { modules: { [id]: crackerView } },   // only when you.role === 'cracker' and phase === 'round'
    crew: null | { pages: [{ moduleId, name, manual }] }, // only when you.role === 'crew'
    final: null | { rounds, total, awards, players }       // phase === 'final'
  }
  ```
  Phase flow: `lobby → (start) reveal → (REVEAL_MS timer) round → (ended) roundResult → (next) reveal|final → (rematch) reveal`. Reveal and round are entered by the Room; `roundResult.nextAllowedAt = resultAt + NEXT_FALLBACK_MS`.

- [ ] **Step 1: Write the failing tests**

```js
// room.test.js  (fake clock, seeded rng)
test('join validates nickname: trims, 2–12 code points, rejects empty and 13 chars, stores html verbatim', () => {
  assert.deepEqual(room.join('p1', '  <b>hi</b> '), { ok: true });
  assert.equal(room.players[0].nickname, '<b>hi</b>');
  assert.deepEqual(room.join('p2', 'a'), { ok: false, error: 'bad-name' });
  assert.deepEqual(room.join('p3', 'x'.repeat(13)), { ok: false, error: 'bad-name' });
  assert.deepEqual(room.join('p4', '🙂🙂'), { ok: true });
});
test('duplicate nickname case-insensitive rejected name-taken', ...);
test('seventh player rejected full', ...);
test('first joiner is host; host migrates on leave', ...);
test('start requires host and >= 2 players', ...);
test('start → reveal → round after REVEAL_MS; roles assigned', ...);
test('round end → roundResult; host can next immediately; others only after 10 s', ...);
test('five rounds → final with summary; rematch → reveal with new cracker order', ...);
test('crew disconnect: still listed, connected=false; removed after 60 s and pages reassigned', ...);
test('cracker disconnect: removed after 30 s and round locked', ...);
test('reconnect within grace cancels removal', ...);
test('room shrinks below 2 mid-round → round locked, phase final', ...);
test('mid-round joiner: role lookout now, full player next round', ...);
test('action in lobby rejected bad-phase', ...);

// rooms.test.js
test('create gives unique codes; get normalizes " abcd "', ...);
test('sweepIdle removes rooms idle longer than 30 min', ...);

// views.test.js
test('cracker snapshot has cracker.modules without secrets and crew null', ...);
test('crew snapshot has only their pages, cracker null, modules status only', ...);
test('lookout snapshot has neither', ...);
test('snapshot JSON never contains the string "secret"', () => assert.equal(JSON.stringify(snap).includes('"secret"'), false));
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `server/room.js`, `server/rooms.js`, `server/views.js`**

Wire `createApp` from Task 1 to construct a `RoomManager` and return it as `rooms` (socket wiring comes in Task 11). Room forwards Round `onEvent` to its own `onEvent` with `to: 'all'`.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add server/room.js server/rooms.js server/views.js server/app.js test/room.test.js test/rooms.test.js test/views.test.js
git commit -m "Add room lifecycle, room manager and role-specific views"
```

---

### Task 11: Socket layer and integration test

**Files:**
- Create: `server/socket.js`, `test/integration.test.js`
- Modify: `server/app.js`

**Interfaces:**
- Client → server events (all with ack callback `(res) => …`):
  - `room:create { nickname }` → `{ ok, code, playerId }`
  - `room:join { code, nickname }` → `{ ok, code } | { ok:false, error: 'not-found'|'full'|'name-taken'|'bad-name' }`
  - `room:resume { code }` → `{ ok } | { ok:false, error:'gone' }`  (uses `playerId` from handshake auth)
  - `room:leave`, `game:start`, `round:next`, `match:rematch` → `{ ok } | { ok:false, error }`
  - `module:action { moduleId, step, action }` → Round.action result
  - `time:ping { t0 }` → `{ t0, serverNow }`
- Server → client: `state` (Snapshot), `event { type, ...data }` (strike, moduleSolved, shuffle, ended, playerJoined, playerLeft), `room:gone`.
- Handshake: `socket.handshake.auth.playerId` (client-generated UUID, persisted in localStorage). `socket.data = { playerId, code }`. Sockets join Socket.IO room `code`. On every `onChange` the layer emits `state` individually per connected player (`snapshotFor`). On `disconnect` → `room.disconnect(playerId)`.
- `createApp` now returns `{ httpServer, io, rooms }` with sockets wired.

- [ ] **Step 1: Write the failing integration test**

```js
// test/integration.test.js — real server, real sockets, timings shortened: { REVEAL_MS: 20, ROUND_MS: 5000, SHUFFLE_AT_MS: [1000, 2000, 3000] }
test('two players create, join, start, and the cracker opens the vault', async () => {
  // c1 room:create → code; c2 room:join; c1 game:start
  // await both receive state.phase === 'round'; crackerId known from state.round
  // read answers white-box: rooms.get(code).round.puzzles[id].secret; drive module:action for all four
  // assert final state.phase === 'roundResult' and round.result === 'opened'
});
test('crew client never receives a payload containing "secret" or cracker modules', ...);
test('reconnect with same playerId during round restores role and pages', async () => {
  // disconnect c2's socket, reconnect with same auth.playerId, emit room:resume → state.you.role === 'crew', state.crew.pages.length === 4
});
test('unknown playerId resuming unknown room gets room:gone', ...);
test('crew sending module:action gets ok:false not-cracker', ...);
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `server/socket.js`, wire in `server/app.js`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all passing, integration suite under 10 s

- [ ] **Step 5: Commit**

```bash
git add server/socket.js server/app.js test/integration.test.js
git commit -m "Add socket layer with per-player snapshots and integration test"
```

---

### Task 12: Client foundation — net, app router, join and lobby screens, first deploy

**Files:**
- Create: `public/js/dom.js`, `public/js/net.js`, `public/js/app.js`, `public/js/screens/join.js`, `public/js/screens/lobby.js`, `public/css/style.css`
- Modify: `public/index.html`

**Interfaces:**
- `net.js`: `connect({ onState, onEvent, onStatus, onGone })`; `call(event, payload) → Promise<res>`; `getPlayerId()` (UUID in `localStorage.vcPlayerId`); `serverNow()` using offset from three `time:ping` samples (median of `serverNow - (t0 + t1) / 2`); `savedRoom()` / `saveRoom(code)` in `localStorage.vcRoom` for resume.
- `app.js`: `store = { state, status: 'connecting'|'online'|'reconnecting', screen }`; `render()` shows exactly one `<section data-screen>` based on `state.phase` and `state.you.role`; `on(eventType, handler)` for screen modules to subscribe to server events.
- `dom.js`: `h(tag, attrs, ...children)` creating elements with `textContent` for strings (never innerHTML), `$()`.
- Screens export `render(root, state, actions)` where `actions = { call }`.

- [ ] **Step 1: Build `index.html` skeleton and `style.css` tokens**

Sections: `join, lobby, reveal, cracker, crew, lookout, roundResult, final, gone`. Meta viewport, `100dvh` layout, 16 px side gutter, tokens on `:root` (graphite bg `#14161a`, surface `#1e2127`, amber `#ffb340`, teal `#2fd4c1`, danger `#ff5a5a`, text `#eef0f3`), min tap target 48 px, `prefers-reduced-motion` rule that sets `--motion: 0`. A top status strip with connection dot + text.

- [ ] **Step 2: Implement `dom.js`, `net.js`, `app.js`**

Connection states: show "Waking up the vault…" while `status === 'connecting'` for more than 1.5 s (Render cold start); dim screen with "Reconnecting…" after 3 s of `reconnecting`. On `connect`, if `savedRoom()` exists emit `room:resume`; on `room:gone` clear saved room and show the `gone` section.

- [ ] **Step 3: Implement `join.js` and `lobby.js`**

Join: nickname input (maxlength 12), code input (uppercase, 4 chars, autocapitalize), Join button, Create Room button, inline error text per server error code (`not-found → "No room with that code."`, `full → "That room is full (6 players)."`, `name-taken → "Someone already has that name."`, `bad-name → "Name must be 2–12 characters."`). Rules panel shown on first join (the verbatim copy) with a "Got it" button; a "?" button on every later screen re-opens it. Lobby: big code, player list with crown on host and dimmed "reconnecting" players, Start (host only, disabled under 2 players with hint "Need at least 2 players"), Leave.

- [ ] **Step 4: Manual verification in two browser tabs**

Run: `npm start`, open `http://localhost:3000` in two tabs (one incognito). Create in one, join in the other, see both in the lobby, Start enabled for host only. Close a tab → other shows "reconnecting" within 1 s and removal after 60 s.

- [ ] **Step 5: Commit, push to GitHub, first Render deploy**

```bash
git add -A
git commit -m "Add client foundation with join and lobby screens"
```
Then: create a GitHub repo `vault-crew` (owner's account), `git remote add origin … && git push -u origin main`; owner creates a Render Blueprint from the repo. Verify `https://<service>.onrender.com/healthz` returns `{ ok: true }` and two phones can reach the lobby. Record the URL in `README.md`.

---

### Task 13: Reveal screen and Cracker screen with four module UIs

**Files:**
- Create: `public/js/screens/reveal.js`, `public/js/screens/cracker.js`, `public/js/modules/circuit.js`, `public/js/modules/tumbler.js`, `public/js/modules/glyphpad.js`, `public/js/modules/pulse.js`, `public/js/timer.js`
- Modify: `public/css/style.css`, `public/js/app.js`

**Interfaces:**
- `timer.js`: `mountTimer(el, { endsAt, serverNow })` rendering `m:ss` every 250 ms from server-offset time, turning amber under 60 s and danger under 15 s.
- Each client module exports `render(root, moduleState, { send })` where `send(action)` calls `module:action` with the module's current `step` and the given action, and `title`.
- `cracker.js`: header (timer, strikes as three slots with text "Strikes 1/3"), four tiles with name + status; tapping an open tile opens that module's full-screen panel with a Back button; solved tiles locked green with a check and "SOLVED"; a banner "Crew pages shuffled" for 2 s on `shuffle` events; strike event shakes the header and flashes danger.
- Module UIs:
  - Circuit: wires as tall buttons labelled with number and colour name; tap cuts (`{ wire }`); cut wires shown severed. Voltage readout "VOLTAGE 7".
  - Tumbler: three glyph SVGs with their spoken names underneath, lamp with text "GREEN"/"RED", a 0–19 dial with − / + and a large number, "Turn Left" / "Turn Right" buttons sending `{ number, dir }`; step indicator "1 of 3".
  - Glyph Pad: 3×3 glyph buttons with names, ringed ones outlined; lock lamp with text; pressed ones highlighted; sends `{ glyph }`.
  - Pulse: a lamp that cycles `sequence` at 700 ms (SLOW) / 350 ms (FAST) per flash with a 1.2 s gap, colour name shown under the lamp during each flash, tempo label, four colour buttons with names sending `{ color }`; progress dots "2 of 4".

- [ ] **Step 1: Implement `timer.js`, `reveal.js`**

Reveal: full-screen "You are the CRACKER" / "You are CREW — pages: Tumbler, Pulse" / "You are the LOOKOUT" using `state.you.role` and `state.crew.pages` names; auto-hidden when phase changes.

- [ ] **Step 2: Implement `cracker.js` and the four module UIs**

- [ ] **Step 3: Manual verification**

Two tabs, start a game. In the cracker tab: open each module, perform a wrong action → strike flash, counter updates in the other tab; solve a module using the server log (temporarily `console.log` secrets in dev only via `DEBUG_SECRETS=1` env, read by `round.js`, never on by default) → tile locks green on both tabs.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add reveal and cracker screens with module controls"
```

---

### Task 14: Crew and Lookout screens, manual rendering, shuffle

**Files:**
- Create: `public/js/screens/crew.js`, `public/js/screens/lookout.js`, `public/js/manual.js`
- Modify: `public/css/style.css`, `public/js/app.js`

**Interfaces:**
- `manual.js`: `renderManual(moduleId, manual) → Element`. Circuit: numbered rule list. Tumbler: 8-row table glyph SVG + name → number, then "Lamp GREEN: Left, Right, Left. Lamp RED: Right, Left, Right." Glyph Pad: 4×4 grid of glyph SVG + name with reading order arrows and the rule text "Press the ringed glyphs in this reading order. Amber lamp: reverse the order." Pulse: two tables SLOW / FAST, "See → Press" with colour swatches and names.
- `crew.js`: header (timer, strikes, four status dots with module names), page tabs (one per assigned page, auto-select first; single page shows no tab bar), shuffle countdown "Pages swap in 5…4…" when `nextShuffleAt - serverNow() <= shuffleWarnMs`, full-screen 1 s "PAGES SWAPPED" flash on `shuffle` events whose `assignmentVersion` is greater than the last applied (ignored otherwise), then tabs re-render from the new `state.crew.pages`.
- `lookout.js`: same header in large type, text "LOOKOUT — call out the time and strikes", shuffle countdown, no pages.

- [ ] **Step 1: Implement `manual.js`, `crew.js`, `lookout.js`**

- [ ] **Step 2: Manual verification**

Three tabs (3 players): crew tabs show 2 pages each; at 60 s both flash and pages change; the cracker tab shows the banner but no page content. Six tabs: one shows LOOKOUT. Two tabs: the crew tab shows 4 tabs and no countdown.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add crew and lookout screens with manuals and shuffle"
```

---

### Task 15: Round result, final screen, rematch, copy summary

**Files:**
- Create: `public/js/screens/results.js`
- Modify: `public/js/app.js`, `public/css/style.css`

**Interfaces:**
- `results.js` exports `renderRoundResult(root, state, actions)` and `renderFinal(root, state, actions)`.
- Round result: headline "VAULT OPENED" / "VAULT LOCKED" / "TIME'S UP", time remaining, strikes, round score, "Round 2 of 5", Next button: enabled for host; for others shows "Waiting for host… (you can continue in 7 s)" counting down from `nextAllowedAt`, then enabled.
- Final: team total, table (Round, Cracker, Result, Time left, Strikes, Score), award cards MVP / Fastest Crack / Cleanest Crack (hidden when null), "Copy summary" (writes plain text: `Vault Crew — 3/5 vaults opened — 4120 pts — MVP: Sam` plus one line per round) using `navigator.clipboard.writeText` with a fallback textarea, Rematch (host) and Leave.

- [ ] **Step 1: Implement `results.js`**

- [ ] **Step 2: Manual verification**

Play through five short rounds with `ROUND_MS` overridden via env `VC_ROUND_MS=20000` (read in `constants.js` when set, dev only); confirm final table, awards, Copy summary output, Rematch returns to reveal with a different first cracker.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add round result and final screens with rematch"
```

---

### Task 16: Polish — set-piece animations, sound, reconnect UX, room-gone

**Files:**
- Create: `public/js/sound.js`
- Modify: `public/css/style.css`, `public/js/app.js`, `public/js/screens/*.js`, `public/index.html`

**Interfaces:**
- `sound.js`: `enable()` (called from a user tap on a speaker toggle in the header; unlocked AudioContext), `play(name)` for `strike | solved | shuffle | opened | locked`, short synthesized tones via WebAudio (no asset files). Muted by default; toggle state in `localStorage.vcSound`.
- Set pieces (CSS classes toggled by `app.js` on `ended` events, all suppressed to fades under reduced motion): `vault-open` — 1.5 s teal sweep + door-split on every screen; `vault-lock` — 0.8 s amber-to-danger slam; `pages-swapped` from Task 14.
- Reconnect UX: status strip states; player list dims "reconnecting" players; on `playerLeft` toast "<name> left — pages reassigned".
- `gone` section: "The vault server restarted and this room is gone." with a Create Room button that clears saved room and returns to join with the nickname prefilled.

- [ ] **Step 1: Implement sound, animations, reconnect and gone UX**

- [ ] **Step 2: Manual verification on real phones**

Open the Render URL on two phones and one laptop. Lock a phone for 20 s mid-round and unlock: it rejoins with the same role, nothing removed. Kill the laptop server locally (`npm start` + Ctrl-C) with a local game running: both tabs show the gone screen. Toggle sound on, cause a strike, hear the tone. Enable "Reduce motion" in OS, confirm no flashes.

- [ ] **Step 3: Commit and deploy**

```bash
git add -A
git commit -m "Add animations, sound, reconnect and restart messaging"
git push
```

---

### Task 17: Playtest checklist, README, submission text

**Files:**
- Create: `README.md`, `docs/submission.md`

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all passing

- [ ] **Step 2: Live playtest on the Render URL, tick every line**

- [ ] Create room, join from 2 then 6 distinct devices; 7th refused.
- [ ] Each of the four modules solved at least once live by voice.
- [ ] Wrong action, three-strike lock, and a timeout each seen once.
- [ ] Exactly five rounds; cracker rotation fair; rematch works.
- [ ] Shuffle seen at 60/120/180 s only; extras rotate; Lookout seen with 6 players; no shuffle with 2 players or after round end.
- [ ] Cracker screen never shows a manual; crew screen never shows module controls.
- [ ] Reconnect after phone lock restores role and pages; host leaving migrates host.
- [ ] Cold start from sleep shows "Waking up the vault…" then the join screen.

- [ ] **Step 3: Write `README.md` (what it is, how to play in 5 lines, run locally, test, deploy) and `docs/submission.md`**

`docs/submission.md`: project title "Vault Crew", one-paragraph description (asymmetric co-op heist, Manual Shuffle, room code, no accounts, built in ChatGPT Work mode interview + Claude Code), the public URL, and a note on the cover image (screenshot of the cracker screen next to a crew screen, 1200×630).

- [ ] **Step 4: Commit and push**

```bash
git add README.md docs/submission.md
git commit -m "Add README and submission notes"
git push
```
