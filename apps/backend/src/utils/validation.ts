import { z } from 'zod';

/**
 * Common validation schemas and utilities
 */

// Email validation with additional checks
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email too long')
  .transform(val => val.toLowerCase().trim());

// Password validation (strong password requirements)
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password too long')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

// Phone number validation (flexible, supports various formats)
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number')
  .transform(val => val.replace(/\D/g, '')); // Remove non-digits

// Name validation
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters')
  .transform(val => val.trim());

// Currency validation (2 decimal places)
export const currencySchema = z
  .number()
  .nonnegative('Amount must be positive')
  .multipleOf(0.01, 'Invalid currency format');

// Date range validation
export const dateRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
}).refine(data => data.end >= data.start, {
  message: 'End date must be after start date',
});

// Pagination schema
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Search schema
export const searchSchema = z.object({
  query: z.string().min(1).max(100),
  filters: z.record(z.any()).optional(),
}).merge(paginationSchema);

// ID validation
export const idSchema = z.string().cuid('Invalid ID format');

// URL validation
export const urlSchema = z.string().url('Invalid URL').max(2000, 'URL too long');

// Positive integer
export const positiveIntSchema = z.number().int().positive();

// Safe HTML content (strips dangerous tags)
export const safeHtmlSchema = z
  .string()
  .max(10000, 'Content too long')
  .transform(val => {
    // Remove script tags and other dangerous content
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  });

/**
 * Validate array has unique values
 */
export function uniqueArray<T>(arr: T[], message = 'Array must contain unique values'): T[] {
  const unique = [...new Set(arr)];
  if (unique.length !== arr.length) {
    throw new Error(message);
  }
  return arr;
}

/**
 * File upload validation
 */
export const fileUploadSchema = z.object({
  filename: z.string().max(255),
  mimetype: z.enum([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/csv',
  ]),
  size: z.number().max(10 * 1024 * 1024, 'File too large (max 10MB)'),
});

/**
 * Coordinates validation (latitude, longitude)
 */
export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * US ZIP code validation
 */
export const zipCodeSchema = z
  .string()
  .regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code');

/**
 * Credit card validation (basic)
 */
export const creditCardSchema = z
  .string()
  .regex(/^\d{13,19}$/, 'Invalid credit card number')
  .refine(luhnCheck, 'Invalid credit card number');

/**
 * Luhn algorithm for credit card validation
 */
function luhnCheck(cardNumber: string): boolean {
  let sum = 0;
  let isEven = false;

  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber[i]);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Validate environment variable
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Validate optional environment variable with default
 */
export function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}
