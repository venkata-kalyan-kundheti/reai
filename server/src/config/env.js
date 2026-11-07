import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to current working directory .env

const emptyToUndef = (v) => (v === '' ? undefined : v);
const str = (def) => z.preprocess(emptyToUndef, def !== undefined ? z.string().default(def) : z.string());
const num = (def) => z.preprocess(emptyToUndef, z.coerce.number().default(def));
const optNum = () => z.preprocess(emptyToUndef, z.coerce.number().optional());

const envSchema = z.object({
  NODE_ENV: z.preprocess(emptyToUndef, z.enum(['development', 'test', 'production']).default('development')),
  PORT: num(4000),
  MONGO_URI: str('mongodb://localhost:27017/reai'),
  CLIENT_ORIGIN: str('http://localhost:5173'),
  STORAGE_DIR: str('./storage'),
  MAX_FILE_MB: num(25),
  MAX_PAGES: num(300),
  GUEST_TTL_DAYS: num(7),
  COOKIE_SECRET: z.string().min(1, 'COOKIE_SECRET is required'),

  LLM_PROVIDER: z.preprocess(emptyToUndef, z.enum(['mock', 'anthropic', 'gemini']).default('mock')),
  LLM_API_KEY: z.preprocess(emptyToUndef, z.string().optional()),
  LLM_MODEL: z.preprocess(emptyToUndef, z.string().optional()),
  SINGLE_PASS_LIMIT_CHARS: num(40000),
  SECTION_SIZE_CHARS: num(24000),

  // ---- Gemini / LLM traffic control (set these to YOUR tier's real limits) ----
  LLM_FALLBACK_MODEL: z.preprocess(emptyToUndef, z.string().optional()), // e.g. gemini-2.5-flash-lite (own quota bucket)
  LLM_RPM: num(8),                       // requests per minute allowed for one model
  LLM_TPM: num(200000),                  // tokens per minute allowed for one model (input + output estimate)
  LLM_MAX_CONCURRENT: num(2),            // simultaneous in-flight requests per model
  LLM_MAX_RETRIES: num(4),               // retries after the first attempt (429 / 503 / timeouts / network)
  LLM_FIRST_TOKEN_TIMEOUT_MS: num(60000),// max wait for the first streamed token
  LLM_IDLE_TIMEOUT_MS: num(30000),       // max silence between streamed chunks
  LLM_REQUEST_TIMEOUT_MS: num(150000),   // hard cap for one attempt
  LLM_QUEUE_TIMEOUT_MS: num(240000),     // max time a background job waits for a free slot
  LLM_INTERACTIVE_QUEUE_TIMEOUT_MS: num(45000), // same, for Ask / "I didn't get this"
  LLM_MAX_OUTPUT_TOKENS: num(8192),
  LLM_MAX_CONTINUATIONS: num(3),         // extra calls when a section is cut off by the token limit
  LLM_THINKING_BUDGET: optNum(),         // 0 disables thinking (faster, cheaper). Blank = auto (0 for *flash* models)
  GENERATIONS_PER_10_MIN: num(12),       // per guest
  ASKS_PER_10_MIN: num(30),              // per guest

  VISION_PROVIDER: z.preprocess(emptyToUndef, z.enum(['mock', 'gemini']).default('mock')),
  VISION_API_KEY: z.preprocess(emptyToUndef, z.string().optional()),
  VISION_MODEL: z.preprocess(emptyToUndef, z.string().optional()),
  MAX_VISION_PAGES: num(30),
  VISION_RENDER_SCALE: num(1.6),         // page raster scale sent to the vision model

  SOFFICE_PATH: str('soffice'),
}).refine(
  (data) => {
    if ((data.LLM_PROVIDER === 'anthropic' || data.LLM_PROVIDER === 'gemini') && !data.LLM_API_KEY) return false;
    return true;
  },
  { message: 'LLM_API_KEY is required when LLM_PROVIDER is anthropic or gemini', path: ['LLM_API_KEY'] }
).refine(
  (data) => {
    if (data.VISION_PROVIDER === 'gemini' && !data.VISION_API_KEY) return false;
    return true;
  },
  { message: 'VISION_API_KEY is required when VISION_PROVIDER is gemini', path: ['VISION_API_KEY'] }
);

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
