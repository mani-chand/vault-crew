# Submission — Handshake AI Skills Studio × OpenAI "Create a Multiplayer Game"

Deadline: 2026-10-30 11:59 PM PT. Submit via the mission page in Handshake with the four items below.

## Project title

Vault Crew

## Project link / URL

https://vault-crew-pbh1.onrender.com

## Project description

Vault Crew is a co-op heist for 2–6 phones. One player is the Cracker and sees the vault: four puzzle modules — a wire bank, a combination dial, a glyph keypad and a flashing lamp — with the controls to work them. Everyone else is Crew and holds the manual pages that explain how to solve those modules. Nobody can crack it alone: the Cracker says what they see, the Crew reads their page and says what to do, out loud, across the table.

The twist a paper manual can't do: every 60 seconds the server shuffles the pages between the Crew's phones, so whoever was walking the Cracker through the dial suddenly holds the wire rules and someone else has to pick up mid-sentence. Four minutes, three strikes, five rounds with a rotating Cracker, a team score and awards for the fastest and cleanest crack.

Friends join from any phone or laptop with a four-letter room code — no login, no install. Every screen is a live slice of one shared game: the timer, strikes and module status are synchronised everywhere, the Cracker never sees a manual, the Crew never sees the puzzle, and a phone that locks and wakes rejoins its seat mid-round.

Built with ChatGPT Work mode as the design interviewer and reviewer (the puzzle set, the shuffle mechanic, the two-player edge case, the hosting constraints and a security review of the resume flow all came out of that interview), implemented as a single Node + Socket.IO server with a vanilla JS client, 160+ automated tests, deployed on Render.

## Cover image

Screenshot of the Cracker screen beside a Crew screen on two phones, 1200×630. Suggested: the Glyph Pad panel (ringed keys) next to the Glyph Pad manual grid.

## Pre-submission checklist

- [ ] Public URL opens the join screen from a phone on mobile data (not just Wi-Fi).
- [ ] A full 5-round game with 3+ real people on real phones, including at least one Manual Shuffle seen live.
- [ ] Cold-start time after 15 min idle measured and noted in README.
- [ ] Title, description, URL and cover image uploaded on the mission page.
