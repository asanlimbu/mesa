/**
 * Server entry point.
 */

import { createApp } from './app.js';
import { config } from './config.js';
import { disconnect } from './db.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(
    `Mesa API listening on http://localhost:${config.port} (${config.nodeEnv})`,
  );
});

/** How long to let in-flight requests finish before closing anyway. */
const SHUTDOWN_GRACE_MS = 10_000;

let shuttingDown = false;

/**
 * Graceful shutdown.
 *
 * Stop accepting new connections, let the requests already running finish,
 * then close the database. The previous version called server.close() without
 * awaiting it and exited immediately, which cut off any request in flight —
 * including, potentially, a booking transaction mid-commit.
 *
 * The timeout is the backstop: a hung request must not keep a dying process
 * alive forever, because an orchestrator will eventually SIGKILL it and that
 * is a worse ending than closing early.
 */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} received, finishing in-flight requests…`);

  const forced = setTimeout(() => {
    console.warn('Grace period elapsed; closing with requests still open.');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  // Do not let this timer be the reason the process stays up.
  forced.unref();

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await disconnect();

    clearTimeout(forced);
    console.log('Closed cleanly.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to shut down cleanly:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/**
 * A process that has thrown an unhandled error is in an unknown state, so it
 * logs loudly and leaves rather than continuing to serve traffic it may get
 * wrong. Logging without exiting is how a broken instance stays in the pool.
 */
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});
