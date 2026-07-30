/**
 * Prisma client singleton.
 *
 * Node's ESM cache makes this a genuine singleton per process, which matters
 * because each PrismaClient opens its own connection pool.
 */

import { PrismaClient } from '@prisma/client';

import { config } from './config.js';

export const prisma = new PrismaClient({
  log: config.isProduction ? ['warn', 'error'] : ['warn', 'error'],
});

export async function disconnect() {
  await prisma.$disconnect();
}
