# Vault Crew — design

Date: 2026-10-25
Status: approved 2026-10-25
Deadline: Handshake AI Skills Studio "Create a Multiplayer Game" mission — entries close 2026-10-30 11:59 PM PT.

## Intent

A real-time, asymmetric co-op heist game played on phones. One player (the **Cracker**) sees a vault with four puzzle modules and the controls to operate them. Everyone else (the **Crew**) holds the manual pages that explain how to solve those modules. Nobody can solve it alone: the Cracker must describe what they see out loud, the Crew must read their pages and say what to do. Players sit in the same room and talk; there is no in-game chat.

The phone-native twist is **Manual Shuffle**: every 60 seconds the server rotates the manual pages between Crew phones, so the person who was helping with the dial suddenly holds the wire-panel page and someone else has to pick up where they left off. A printed manual can't do that.

Why now: contest entry. Judged 25% each on Execution, Creativity, Usefulness, Polish. The design choices below lean toward a visibly original mechanic, a demo-ready end-to-end flow, and polished edge-case handling (reconnects, host drop, timer expiry).

Audience: the builder's friends, 3–5 people at a table, occasionally 2 or 6.

## Goals

- A public link. Friends open it on any phone or laptop, enter a nickname and a 4-letter room code, and play. No login, no install.
- Every device shows the correct role-specific slice of one shared game state, live: timer, strikes, module solved/unsolved, shuffle events, round transitions.
- A new player understands the rules from a single screen.
- A full five-round match completes cleanly, including failures, disconnects, and a rematch.
- Server is authoritative. Puzzle answers never leave the server. Invalid, duplicate, or stale actions are rejected.

Process note: this design was interviewed in ChatGPT Work mode (per the Handshake mission), and ChatGPT's finalized plan is mirrored here. Claude Code implements; ChatGPT reviews.

## Non-goals

- Accounts, persistence between matches, or global leaderboards.
- In-game text or voice chat.
- Native apps, offline play, or PWA install prompts.
- More than one concurrent match per room code.
- AI-generated puzzles or an LLM in the loop. Puzzles are procedurally generated from fixed rule sets.

## Anti-goals (would make this a failure even if it works)

- Looking like a Keep Talking & Nobody Explodes clone. No bomb imagery, no "defuse" language, no copied module rules, no lookalike art. Wire-cutting may remain one module but is not the identity.
- A Cracker who can scroll, tab, or inspect their way to a manual, or a Crew member who can see the live puzzle.
- A timer that drifts between phones or that a client can extend.
- A round that silently hangs when someone's phone locks or their connection drops.

## Players and roles

- 2–6 players per room. Minimum 2 to start.
- One **Cracker** per round. Rotates each round in join order; with fewer than 5 players some people crack twice.
- Everyone else is **Crew**. Each Crew member holds one or more manual pages.
- **Lookout**: a Crew member holding zero pages this minute (only happens with 5 Crew and 4 pages). Lookout sees the live timer, strikes, and module status board. It is a real screen with a real job (calling out time and strikes), not an idle screen.
- Page distribution is as even as possible. With 3 Crew, one holds two pages as tabs. With 2 players, the single Crew member holds all four as tabs and Manual Shuffle is disabled.

| Players | Crew | Distribution |
| --- | --- | --- |
| 2 | 1 | all four pages as tabs on one device, no shuffle |
| 3 | 2 | two pages each |
| 4 | 3 | one device holds two pages, two hold one each |
| 5 | 4 | one page each |
| 6 | 5 | four page holders, one Lookout |

- Who holds the extra page, and who is Lookout, rotates across shuffles and rounds. The server tracks per-player counts of "held two pages" and "was Lookout" over the match and picks the least-burdened player each time, so the balance is over the five rounds, not just within one.

## Match structure

- **Lobby**: host creates room, gets code, others join. Host presses Start when ≥2 players are present. Rules screen is shown to every player on join (one screen, dismissable, re-openable from a "?" button at any time).
- **Five rounds**. Each round: role reveal (3 s) → 4-minute countdown → result (solved / locked / timed out) → scoreboard → next round. Host advances between rounds; if host is absent, any player can advance after 10 s.
- **Round ends** when all four modules are solved, the third strike lands (vault locks), or the clock reaches zero.
- **Final screen**: team total, per-round table (Cracker, result, time remaining, strikes), awards, a "Copy summary" button that puts a short plain-text recap on the clipboard, and a Rematch button (same room, same players).
- **Rematch rotation**: the server remembers who has been Cracker across the room's lifetime and starts the next match with the players who have cracked least. With 6 players and 5 rounds, nobody is skipped twice in a row.

### Scoring (my call; co-op, so this is team score plus bragging rights)

- Solved round: 1000 + 5 × seconds remaining − 150 × strikes.
- Locked or timed-out round: 0, but modules solved before failure show in the round table.
- Awards on the final screen: **MVP Cracker** (highest single-round score), **Fastest Crack** (least elapsed time on a solved round), **Cleanest Crack** (solved with fewest strikes; ties go to the faster one). No Crew-side award: with voice-only communication there is nothing objective to measure.

## Timer

- 4 minutes, server-owned. Server sends `roundStartedAt` (server epoch ms) and `durationMs`; clients render from that plus a one-time clock-offset estimate. No client ever tells the server what time it is.
- No bonus time, no extensions.
- Server fires round end on its own timer, not on a client message.

## Strikes

- Any incorrect module action = 1 strike. Third strike = vault locked, round ends immediately.
- Strikes are shown on every screen (Cracker, Crew, Lookout) the instant they happen, with a distinct flash and short sound.
- A shuffle never causes or clears a strike.

## Manual Shuffle

- Enabled when Crew count ≥ 2 (i.e. 3+ players). Disabled for 2-player rooms.
- Fires at t = 60 s, 120 s, 180 s into the round, unless the round has already ended.
- Server recomputes the page → Crew assignment. The new assignment must differ from the old one whenever any different valid assignment exists.
- Every connected device gets the same `shuffle` event and shows a synchronized 1-second "PAGES SWAPPED" flash. Each Crew device then receives only its own new pages. The Cracker screen gets the flash and a small "crew pages shuffled" banner but never any manual content.
- A 5-second countdown before each shuffle is visible on Crew screens ("shuffle in 5…") so people can finish a sentence.
- Each shuffle event carries a unique `shuffleId` and a monotonically increasing `assignmentVersion`. Clients ignore a shuffle whose version they have already applied, so a re-sent event never double-animates or double-assigns.
- Reconnecting players receive their current assignment and version, never a pre-shuffle copy.

## The four modules

Manual pages are fixed for the whole match, puzzles are fresh every round (my call). At match start the server generates the match's manual set once: Tumbler's glyph→number table, Glyph Pad's 4×4 master grid, Pulse's two tables. Circuit Bank's rule list is static. Crew learn the pages across five rounds, and a shuffle handoff is a page someone has seen before. Each round only the puzzle instance (wires, dial glyphs, ringed pad glyphs, flash sequence) is regenerated against the match's manuals.

Each module is an independent generator: `generateManual(matchRng) → manualPage` once per match, then `generatePuzzle(roundRng, manualPage) → { crackerView, answer }` per round, plus `validate(state, action) → ok | strike | solved`. The Cracker's client receives only `crackerView`. The Crew client receives only `manualPage`. `answer` never leaves the server. Every generated puzzle is self-checked on generation (solver applied to crackerView + manualPage must reproduce answer) so an unsolvable or ambiguous puzzle is never shown.

Module rules below are the builder's starting point and are my call; they may be tuned for difficulty as long as each stays original, deterministic, and solvable from the manual in under a minute by a first-time player.

### 1. Circuit Bank (wires)

Cracker sees: 4–6 vertical wires, each one of {red, blue, yellow, green, white}, numbered top to bottom, plus a voltage readout (1–9). Tapping a wire cuts it. One correct cut solves the module; a wrong cut is a strike and the wire stays cut (so the puzzle visibly changes — the manual's rules are applied to the remaining uncut wires).

Manual page: ordered rule list, first match wins:

1. No red wires → cut the 2nd wire.
2. Voltage is even and there is a blue wire → cut the last blue wire.
3. More than one yellow wire → cut the first yellow wire.
4. Exactly one white wire → cut the wire directly below the white one (if white is last, cut the 1st wire).
5. Otherwise → cut wire number (voltage mod wire count), and if that is 0, cut the last wire.

### 2. Tumbler (combination dial)

Cracker sees: a dial 0–19, a row of three glyphs above it (from a set of 8 named glyphs), and an arrow lamp that is either green or red. Controls: rotate dial (drag or ±), then commit with "Turn Left" or "Turn Right". Three commits solve it. A wrong commit (wrong number or wrong direction) is a strike and resets progress to step 1.

Manual page: glyph → number table (8 glyphs → distinct values 0–19), and the direction rule: green lamp = Left, Right, Left; red lamp = Right, Left, Right.

### 3. Glyph Pad (symbol keypad)

Cracker sees: a 3×3 pad of 9 glyphs (drawn from a master set of 16), four of which have a lit ring. A lock lamp that is either white or amber. Tapping a glyph presses it. Pressing the four ringed glyphs in the correct order solves it; any wrong press is a strike and resets progress.

Manual page: the master 4×4 grid of 16 glyphs. Rule: press the ringed glyphs in the order they appear in the grid reading left-to-right, top-to-bottom. If the lock lamp is amber, press them in reverse order.

### 4. Pulse (light sequence)

Cracker sees: one lamp that flashes a repeating sequence of 4 colours (from red, green, blue, yellow) with a pause between loops, a tempo label (SLOW or FAST), and four coloured buttons. Pressing four buttons in the correct order solves it; a wrong press is a strike and resets progress.

Manual page: two mapping tables, one for SLOW and one for FAST, each mapping "colour you see" → "colour to press". Tables are fixed per match (generated once at match start so Crew can learn them across rounds; the flashed sequence is new each round).

## Screens

- **Join / Create**: nickname (2–12 chars), room code (4 letters, no I/O/0/1), Create Room button. Join errors inline (room not found, room full, name taken, game in progress → offered Lookout spectator slot until next round).
- **Rules** (one screen): three sentences and a diagram. "Cracker: say what you see. Crew: say what to do. Nobody reads anyone else's screen. Four modules, four minutes, three strikes. Every minute the Crew's pages swap."
- **Lobby**: room code large, player list with host crown, Start (host only, enabled at ≥2), Leave.
- **Role reveal**: full-screen "You are the CRACKER" / "You are CREW — pages: Tumbler, Pulse" / "You are LOOKOUT", 3 s.
- **Cracker**: timer, strikes, four module tiles (tap to open full-screen module controls, solved tiles are locked green), shuffle banner.
- **Crew**: timer, strikes, module status board (four dots), page tabs (1–4 tabs depending on assignment), shuffle countdown and flash. No module controls, no puzzle state.
- **Lookout**: timer, strikes, module status board, shuffle countdown. Large type so they can read it out.
- **Round result**: solved / locked / timed out, time remaining, strikes, round score, Next (host) with fallback.
- **Final**: team total, round table, MVP, Rematch, Leave.

All screens: phone-first, works at 360 px wide, large tap targets (≥48 px), no horizontal scroll. Laptop works too. Dark cyber-heist look: graphite surfaces, electric amber and teal accents, bold typography. Colour is never the only signal (wires and buttons also carry labels/icons; status dots also carry text) so colour-blind players can play. `prefers-reduced-motion` turns flashes into fades and disables the vault-opening animation.

Set pieces worth the effort: a synchronized vault-opening animation on every screen when the fourth module solves, a synchronized lock-down animation on the third strike, and the PAGES SWAPPED flash.

Sound: short, optional (muted until the user taps a sound toggle, because mobile browsers block autoplay). Strike, module solved, shuffle, round end.

## Connection, reconnection, and host

- Each browser gets a `playerId` token stored in localStorage on first join. Reconnect with the same token re-attaches to the same player and replays current role-specific state.
- Disconnect grace (my call): 60 s for Crew, 30 s for the Cracker. Player shows as "reconnecting" on everyone's list. The round clock never pauses — a disconnect costs the team time, consistent with "no extensions". After the grace expires the player is removed: if they were the Cracker, the round ends as locked; if they were Crew, their pages are redistributed immediately (shown to everyone as an unscheduled shuffle, with its own `assignmentVersion`).
- Player count changes mid-match (my call): shuffle eligibility is re-evaluated at every 60 s boundary against the players currently in the room (connected or in grace), so a room that shrinks to 2 stops shuffling and a room that grows back to 3 resumes. If a removal leaves fewer than 2 players, the current round ends as locked and the match ends early; the final screen shows the rounds that were played.
- Host migration: if the host leaves, host passes to the next player in join order.
- Room lifetime: 30 minutes idle → deleted. Room code is reusable after that.
- Late joiners during a round (my call): they take a normal player slot and count toward the cap of 6 — "room full" refuses them like anyone else. Until the round ends they see the Lookout screen (status board only) and are not in the page rotation; from the next round they are a full player in Cracker and page rotation. There is one Lookout screen, used by both zero-page Crew and mid-round joiners.
- **Server restart**: state is in-memory, so a restart loses every active room. The client detects this (its `playerId` + room code is unknown to the server after reconnect) and shows an honest "The vault server restarted and this room is gone. Create a new room?" screen with a one-tap Create. No pretending to recover.
- Connection status is always visible: a small indicator on every in-game screen shows connected / reconnecting, and the whole screen dims with "Reconnecting…" after 3 s offline.

## Anti-cheat and fairness

- Server is the only source of truth for puzzle answers, timer, strikes, assignments, and scores.
- Every socket event is validated against the sender's current role. A Crew socket sending a module action is dropped and logged. A Cracker socket asking for a manual gets nothing.
- Module actions carry a per-module `step` counter; actions with a stale step are ignored (prevents double-tap double-strikes).
- Round and shuffle timers are `setTimeout`s on the server, cleared on round end.

## Tech (my call)

- Node 20, single process: Express serves static client from `/public`, Socket.IO on the same port. No build step, no bundler, no framework. Vanilla HTML/CSS/JS client.
- Seeded RNG (small mulberry32 or similar) so puzzle generators are deterministic in tests.
- Tests: `node --test`. Unit tests for all four generators (self-check across many seeds), shuffle assignment (changes when it can, even distribution, cross-round fairness, 2-player disabled), and the round state machine (strikes, lock, timeout, reconnect replay). One multi-client integration test that drives a full 2-player round over real Socket.IO connections.
- `/healthz` endpoint for the host's health check.
- Deploy: **Render** free web service (owner's choice; persistent Node process, WebSockets supported). Not Vercel/Netlify serverless. Render builds from a GitHub repo, so the project is pushed to GitHub and a `render.yaml` blueprint in the repo defines the service (`npm ci`, `npm start`, health check `/healthz`, Node 22). The owner connects the repo in the Render dashboard. Render free tier sleeps after ~15 min idle and cold-starts in 30–60 s; the lobby shows a short "waking up the vault…" state while the socket connects so the first player isn't staring at a blank page. Deploy is a mid-build milestone, not a last-day step: first deploy as soon as the lobby works, so sleep and cold-start behaviour are known early.
- Repo: `/home/manichand/personal_space/vault-crew`, git-initialised, this spec committed.

## Submission (from the contest rules)

Due 2026-10-30 11:59 PM PT via the Handshake mission page: project title, cover image, project description, project link/URL. Nothing else is required. The owner submits. ChatGPT review is the owner's workflow between build steps, not a gate inside this plan: the builder ships working, tested increments and the owner forwards them for review whenever they like.

## Left to the builder

- Exact glyph set and artwork (SVG, original, 16 distinct shapes that are easy to describe out loud — this matters more than looking pretty).
- Exact CSS, animation timing, sound assets.
- Wire-panel generator constraints that keep rule 5 from being the answer too often (aim for roughly even spread across rules 1–5).
- Internal module naming and file layout.
- Clock-offset estimation method.
