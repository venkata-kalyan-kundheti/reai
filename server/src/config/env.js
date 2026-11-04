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
  SINGLE_PASS_LIMIT_CHARS: num(120000),
  SECTION_SIZE_CHARS: num(60000),

  VISION_PROVIDER: z.preprocess(emptyToUndef, z.enum(['mock', 'gemini']).default('mock')),
  VISION_API_KEY: z.preprocess(emptyToUndef, z.string().optional()),
  VISION_MODEL: z.preprocess(emptyToUndef, z.string().optional()),
  MAX_VISION_PAGES: num(30),

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
