import { createApp } from './app.js';
import { DEFAULT_TIMINGS } from './constants.js';

const port = Number(process.env.PORT) || 3000;

// Local playtesting only: VC_ROUND_MS=20000 makes rounds 20 s long so a whole
// five-round match can be clicked through quickly. Never set in production.
const timings = process.env.VC_ROUND_MS
  ? { ...DEFAULT_TIMINGS, ROUND_MS: Number(process.env.VC_ROUND_MS) }
  : DEFAULT_TIMINGS;

const { httpServer } = createApp({ timings });

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Vault Crew listening on http://0.0.0.0:${port}`);
});
