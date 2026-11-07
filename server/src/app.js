import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { guestAuth } from './middleware/guestAuth.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import documentsRoutes from './routes/documents.routes.js';
import generationsRoutes from './routes/generations.routes.js';
import { allSchedulerStats } from './services/llm/gemini/scheduler.js';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === env.CLIENT_ORIGIN) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(env.COOKIE_SECRET));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Live view of the Gemini traffic controller (queue length, requests/tokens used this minute, cooldowns).
// Handy to see why a request is waiting. Disabled in production.
app.get('/api/health/llm', (req, res) => {
  if (env.NODE_ENV === 'production') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  res.json({ provider: env.LLM_PROVIDER, model: env.LLM_MODEL, fallback: env.LLM_FALLBACK_MODEL, schedulers: allSchedulerStats() });
});

app.use(guestAuth);

app.use('/api/documents', documentsRoutes);
app.use('/api/generations', generationsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;

