import helmet from 'helmet';
import cors from 'cors';
import { Express } from 'express';

/**
 * Security middleware configuration
 */
export function setupSecurity(app: Express) {
  // CORS configuration
  const corsOptions = {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:19006', // Expo web
      ];

      if (process.env.NODE_ENV === 'production') {
        // Production: whitelist only
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      } else {
        // Development: allow all
        callback(null, true);
      }
    },
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400, // 24 hours
  };

  app.use(cors(corsOptions));

  // Security headers with Helmet
  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for email templates
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },

      // Prevent clickjacking
      frameguard: {
        action: 'deny',
      },

      // Prevent MIME type sniffing
      noSniff: true,

      // Force HTTPS in production
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // Prevent XSS attacks
      xssFilter: true,

      // Referrer policy
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
    })
  );

  // Custom security headers
  app.use((req, res, next) => {
    // Prevent caching of sensitive data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // Permissions Policy (formerly Feature Policy)
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(self), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
    );

    next();
  });
}

/**
 * Input sanitization to prevent XSS
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;

  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove inline event handlers
    .trim();
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj };

  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]) as any;
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeObject(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * SQL injection prevention (Prisma handles this, but good to verify)
 */
export function detectSQLInjection(input: string): boolean {
  const sqlKeywords = [
    /(\s|^)(DROP|DELETE|INSERT|UPDATE|SELECT|UNION|ALTER|CREATE|REPLACE)(\s|$)/i,
    /--/,
    /;.*--/,
    /\/\*.*\*\//,
    /'.*OR.*'.*=/i,
    /".*OR.*".*=/i,
  ];

  return sqlKeywords.some(pattern => pattern.test(input));
}

/**
 * Validate that input doesn't contain SQL injection attempts
 */
export function validateNoSQLInjection(input: string): void {
  if (detectSQLInjection(input)) {
    throw new Error('Invalid input detected');
  }
}
