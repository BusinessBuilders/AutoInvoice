import { createLogger, format, transports } from 'winston';
import * as Sentry from '@sentry/node';

/**
 * Comprehensive logging and monitoring setup
 */

// Initialize Sentry (error tracking)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // 10% of transactions
    beforeSend(event) {
      // Don't send development errors to Sentry
      if (process.env.NODE_ENV === 'development') {
        console.log('Sentry event (not sent):', event);
        return null;
      }
      return event;
    },
  });
}

// Winston logger setup
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'leadflow-pro' },
  transports: [
    // Write all logs to console
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      ),
    }),

    // Write all logs to combined.log
    new transports.File({ filename: 'logs/combined.log' }),

    // Write errors to error.log
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
  ],
});

// Production: add external logging service
if (process.env.NODE_ENV === 'production') {
  // Can add DataDog, LogDNA, etc.
}

/**
 * Log levels:
 * - error: Errors that require immediate attention
 * - warn: Warning messages
 * - info: General information
 * - debug: Debug information
 */

/**
 * Error tracking wrapper
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  logger.error(error.message, { stack: error.stack, ...context });

  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = Date.now();
  }

  end(metadata?: Record<string, any>): number {
    const duration = Date.now() - this.startTime;

    logger.info(`[PERF] ${this.label}`, {
      duration: `${duration}ms`,
      ...metadata,
    });

    // Alert if slow
    if (duration > 1000) {
      logger.warn(`[SLOW QUERY] ${this.label} took ${duration}ms`, metadata);
    }

    return duration;
  }
}

/**
 * Business metrics tracking
 */
export interface MetricEvent {
  type: 'lead_created' | 'invoice_sent' | 'payment_received' | 'user_signup' | 'custom';
  userId?: string;
  organizationId?: string;
  value?: number;
  metadata?: Record<string, any>;
}

export function trackMetric(event: MetricEvent): void {
  logger.info('[METRIC]', event);

  // Send to analytics service (Mixpanel, Amplitude, etc.)
  if (process.env.ANALYTICS_API_KEY) {
    // Implementation here
  }
}

/**
 * Health check status
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: { status: string; latency?: number };
    redis: { status: string; latency?: number };
    email: { status: string };
    ai: { status: string };
  };
}

/**
 * Request logging middleware
 */
export function logRequest(
  method: string,
  path: string,
  userId?: string,
  duration?: number,
  statusCode?: number
): void {
  const logData = {
    method,
    path,
    userId,
    duration: duration ? `${duration}ms` : undefined,
    statusCode,
  };

  if (statusCode && statusCode >= 400) {
    logger.warn('[REQUEST ERROR]', logData);
  } else {
    logger.info('[REQUEST]', logData);
  }
}

/**
 * Database query logging
 */
export function logQuery(query: string, duration: number, params?: any): void {
  const logData = {
    query: query.substring(0, 100), // Truncate long queries
    duration: `${duration}ms`,
    params,
  };

  if (duration > 100) {
    logger.warn('[SLOW QUERY]', logData);
  } else {
    logger.debug('[QUERY]', logData);
  }
}

/**
 * User action tracking (audit log)
 */
export function logAuditEvent(
  userId: string,
  action: string,
  resource: string,
  resourceId?: string,
  changes?: Record<string, any>
): void {
  logger.info('[AUDIT]', {
    userId,
    action,
    resource,
    resourceId,
    changes,
    timestamp: new Date().toISOString(),
  });

  // Store in database for compliance
  // prisma.auditLog.create({ ... })
}

export { Sentry };
