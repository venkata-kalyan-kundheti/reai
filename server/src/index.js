import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { connectDb } from './db/connect.js';
import { Document } from './models/Document.js';
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

