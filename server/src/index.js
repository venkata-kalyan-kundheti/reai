import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { connectDb } from './db/connect.js';
import { Document } from './models/Document.js';
import { Generation } from './models/Generation.js';
import { startCleanupTimer } from './utils/cleanup.js';
import app from './app.js';

async function bootstrap() {
  await connectDb();

  // Reset any documents interrupted during a previous server run
  await Document.updateMany(
    { status: 'parsing' },
    {
      status: 'failed',
      errorCode: 'SERVER_RESTARTED',
      errorMessage: 'Processing was interrupted. Please upload again.',
    }
  );

  await Document.updateMany(
    { visionStatus: { $in: ['pending', 'running'] } },
    { visionStatus: 'failed', visionNote: 'Diagram analysis was interrupted by a server restart.' }
  );

  // Generations that were running when the server stopped can never finish: mark them resumable
  // (the browser then shows "Resume" and continues from the last completed section).
  const stale = await Generation.updateMany(
    { status: { $in: ['pending', 'streaming'] } },
    {
      status: 'failed',
      errorCode: 'SERVER_RESTARTED',
      errorMessage: 'The server restarted while writing this explanation. Press Resume to continue.',
      errorRetryable: true,
    }
  );
  if (stale.modifiedCount) logger.warn({ count: stale.modifiedCount }, 'Marked interrupted generations as resumable');

  startCleanupTimer();

  const server = app.listen(env.PORT, () => {
    logger.info(`ReAI server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, closing HTTP server`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to bootstrap server');
  process.exit(1);
});

