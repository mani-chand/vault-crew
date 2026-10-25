import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const { httpServer } = createApp();

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Vault Crew listening on http://0.0.0.0:${port}`);
});
