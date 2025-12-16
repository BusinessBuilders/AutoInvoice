import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// In monorepo, explicitly point to backend .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4-turbo-preview'),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),

  // Ollama
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama2'),

  // Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // Application
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  MAX_FILE_SIZE: z.string().default('10485760'),
  UPLOAD_DIR: z.string().default('./uploads'),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
