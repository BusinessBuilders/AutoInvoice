import { TRPCError } from '@trpc/server';
import { Redis } from 'ioredis';

/**
 * Rate limiting middleware using Redis
 * Falls back to in-memory if Redis not available
 */

// In-memory fallback (for development)
const memoryStore = new Map<string, { count: number; resetAt: number }>();

// Redis client (optional, for production)
let redis: Redis | null = null;

try {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
  }
} catch (error) {
  console.warn('⚠️  Redis not available, using in-memory rate limiting');
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string; // Custom error message
}

/**
 * Default rate limit configs
 */
export const RATE_LIMITS = {
  // General API: 100 requests per minute
  general: {
    windowMs: 60 * 1000,
    max: 100,
  },

  // Auth endpoints: 5 requests per 15 minutes (prevent brute force)
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later',
  },

  // Password reset: 3 requests per hour
  passwordReset: {
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many password reset requests, please try again later',
  },

  // Email verification: 5 requests per hour
  emailVerification: {
    windowMs: 60 * 60 * 1000,
    max: 5,
  },

  // AI endpoints: 20 requests per minute (expensive)
  ai: {
    windowMs: 60 * 1000,
    max: 20,
    message: 'AI rate limit exceeded, please slow down',
  },

  // Export endpoints: 10 per hour
  export: {
    windowMs: 60 * 60 * 1000,
    max: 10,
  },
};

/**
 * Rate limit checker
 */
export async function checkRateLimit(
  identifier: string, // Usually userId or IP address
  config: RateLimitConfig
): Promise<void> {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();

  if (redis) {
    // Use Redis for production
    const current = await redis.get(key);

    if (current) {
      const count = parseInt(current);
      if (count >= config.max) {
        const ttl = await redis.ttl(key);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: config.message || `Rate limit exceeded. Try again in ${Math.ceil(ttl / 60)} minutes`,
        });
      }

      await redis.incr(key);
    } else {
      await redis.set(key, '1', 'PX', config.windowMs);
    }
  } else {
    // Use in-memory for development
    const record = memoryStore.get(key);

    if (record) {
      if (now < record.resetAt) {
        if (record.count >= config.max) {
          const waitSeconds = Math.ceil((record.resetAt - now) / 1000);
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: config.message || `Rate limit exceeded. Try again in ${waitSeconds} seconds`,
          });
        }
        record.count++;
      } else {
        // Reset window
        memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
      }
    } else {
      memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
    }
  }
}

/**
 * Clean up expired in-memory records (run periodically)
 */
export function cleanupExpiredRateLimits(): void {
  if (!redis) {
    const now = Date.now();
    for (const [key, record] of memoryStore.entries()) {
      if (now > record.resetAt) {
        memoryStore.delete(key);
      }
    }
  }
}

// Cleanup every 5 minutes
if (!redis) {
  setInterval(cleanupExpiredRateLimits, 5 * 60 * 1000);
}

/**
 * Get rate limit status for identifier
 */
export async function getRateLimitStatus(
  identifier: string,
  config: RateLimitConfig
): Promise<{
  limit: number;
  remaining: number;
  reset: Date;
}> {
  const key = `ratelimit:${identifier}`;

  if (redis) {
    const current = await redis.get(key);
    const ttl = await redis.ttl(key);
    const count = current ? parseInt(current) : 0;

    return {
      limit: config.max,
      remaining: Math.max(0, config.max - count),
      reset: new Date(Date.now() + ttl * 1000),
    };
  } else {
    const record = memoryStore.get(key);
    if (record) {
      return {
        limit: config.max,
        remaining: Math.max(0, config.max - record.count),
        reset: new Date(record.resetAt),
      };
    }

    return {
      limit: config.max,
      remaining: config.max,
      reset: new Date(Date.now() + config.windowMs),
    };
  }
}
