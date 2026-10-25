# Vault Crew

A co-op heist game for 2–6 phones. One player is the **Cracker** and sees the vault: four puzzle modules and the controls to work them. Everyone else is **Crew** and holds the manual pages that say how to solve those modules. Nobody can do it alone — the Cracker describes what they see, the Crew reads their pages and says what to do, and every 60 seconds the pages **shuffle between Crew phones**.

Four modules, four minutes, three strikes, five rounds. No accounts, nothing to install: open the link, type a nickname and a four-letter room code.

**Play:** https://vault-crew-pbh1.onrender.com (free tier: the first visit after ~15 min idle takes 30–60 s to wake up)

## How to play (what the rules screen says)

> Cracker: say what you see. Crew: say what to do. Nobody reads anyone else's screen. Four modules, four minutes, three strikes. Every minute the Crew's pages swap.

- **Circuit Bank** — coloured wires and a voltage readout. The manual is an ordered rule list; cut one wire.
- **Tumbler** — three glyphs and an arrow lamp. The manual maps glyphs to dial numbers and the lamp to a left/right pattern.
- **Glyph Pad** — a 3×3 pad with four ringed glyphs. The manual is a 4×4 grid; press the ringed glyphs in grid order (reversed if the lamp is amber).
- **Pulse** — a lamp flashing four colours at a slow or fast tempo. The manual has a "see → press" table per tempo.

The Cracker rotates each round. With 6 players one Crew member is the **Lookout** for the minute (no page, calls out time and strikes). Scoring per opened vault: `1000 + 5 × seconds left − 150 × strikes`.

## Run locally

```bash
npm install
npm start            # http://localhost:3000
npm test             # unit + integration tests (node --test)
```

Open the URL in two browser profiles (or a phone and a laptop on the same network) to play. For quick playtesting, `VC_ROUND_MS=20000 npm start` makes rounds 20 seconds long.

## How it is built

- Node 22, Express, Socket.IO. One process serves the static client and owns all game state in memory.
- The server is authoritative: puzzle answers never leave it, the clock is server time, every action is validated against the sender's role, and stale or duplicate actions are ignored.
- Identity is a server-issued `playerId` (public) plus a secret `resumeToken`; a phone that locks and wakes resumes its seat with the pair.
- Vanilla HTML/CSS/JS client, no build step. Shared glyph art lives in `shared/` and is used by both sides.

```
server/   constants, rng, modules/ (4 puzzles), assignment, scoring, round, match, room, rooms, views, socket, app
public/   index.html, css/, js/ (net, app, screens/, modules/, manual, instruments, timer, sound)
shared/   glyphs.js
test/     one file per server module plus a real-socket integration test
docs/     design spec, implementation plan, submission notes
```

## Deploy (Render)

`render.yaml` defines a free web service (`npm ci`, `npm start`, health check `/healthz`). Connect the GitHub repo in the Render dashboard as a Blueprint and it deploys on every push to `main`.

Known free-tier behaviour: the service sleeps after ~15 minutes idle and takes 30–60 seconds to wake. The client shows "Waking up the vault…" while that happens. State is in memory, so a restart ends any room in progress; the client tells players honestly and offers a new room.

## Design notes

- `docs/superpowers/specs/2026-10-25-vault-crew-design.md` — what and why
- `docs/superpowers/plans/2026-10-25-vault-crew.md` — how it was built, task by task
- `docs/submission.md` — contest submission text
