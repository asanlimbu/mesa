/**
 * Server entry point.
 */

import { createApp } from './app.js';
import { config } from './config.js';
import { disconnect } from './db.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Mesa API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

/** Close connections cleanly so `node --watch` restarts do not leak them. */
async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down.`);
  server.close();
  await disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
