import { Document } from '../models/Document.js';
import { deleteDocumentCascade } from '../services/storage/index.js';
import { logger } from './logger.js';

export async function runCleanup() {
  try {
    const expired = await Document.find({ expiresAt: { $lt: new Date() } }).select('_id');
    for (const doc of expired) {
      logger.info({ documentId: String(doc._id) }, 'Deleting expired document');
      await deleteDocumentCascade(doc._id);
    }
  } catch (err) {
    logger.error({ err }, 'Error during expired document cleanup');
  }
}

export function startCleanupTimer() {
  // Run once on startup, then every hour
  runCleanup();
  const timer = setInterval(runCleanup, 60 * 60 * 1000);
  timer.unref();
  return timer;
}

