import OpenAI from 'openai';
import { env } from '../utils/env';
import logger from '../utils/logger';

let openaiClient: OpenAI | null = null;

/**
 * Initialize OpenAI client for embeddings
 */
function getOpenAIClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) {
    logger.warn('OpenAI API key not configured, vector search disabled');
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

/**
 * Generate embedding vector for text using OpenAI
 * Uses text-embedding-3-small model (1536 dimensions, cost-effective)
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const client = getOpenAIClient();

  if (!client) {
    return null; // Graceful degradation - will fall back to keyword search
  }

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.trim(),
      encoding_format: 'float',
    });

    const embedding = response.data[0].embedding;

    logger.debug('Generated embedding', {
      textLength: text.length,
      dimensions: embedding.length,
    });

    return embedding;
  } catch (error: any) {
    logger.error('Failed to generate embedding', {
      error: error.message,
      text: text.substring(0, 100),
    });
    return null; // Graceful fallback
  }
}

/**
 * Generate embedding for a service
 * Combines name, code, description, and category for rich semantic context
 */
export async function generateServiceEmbedding(service: {
  name: string;
  code: string;
  description?: string | null;
  category: string;
}): Promise<number[] | null> {
  const parts = [
    service.name,
    service.code,
    service.category,
    service.description || '',
  ].filter(Boolean);

  const text = parts.join(' | ');
  return generateEmbedding(text);
}

/**
 * Generate embedding for a customer
 * Combines name, nicknames, and company for matching flexibility
 */
export async function generateCustomerEmbedding(customer: {
  name: string;
  nickname?: string[];
  company?: string | null;
}): Promise<number[] | null> {
  const parts = [
    customer.name,
    ...(customer.nickname || []),
    customer.company || '',
  ].filter(Boolean);

  const text = parts.join(' | ');
  return generateEmbedding(text);
}

/**
 * Calculate cosine similarity between two vectors
 * Returns a score between 0 (completely different) and 1 (identical)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
