import { z } from 'zod';

// Parsed invoice data structure
export const InvoiceDataSchema = z.object({
  customerName: z.string(),
  serviceDate: z.string(),
  serviceLocation: z.string().optional(),
  services: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    rate: z.number(),
    amount: z.number(),
  })),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type InvoiceData = z.infer<typeof InvoiceDataSchema>;

// Receipt data structure
export const ReceiptDataSchema = z.object({
  vendor: z.string(),
  amount: z.number(),
  date: z.string(),
  category: z.string().optional(),
  items: z.array(z.object({
    description: z.string(),
    amount: z.number(),
  })).optional(),
  confidence: z.number().min(0).max(1),
});

export type ReceiptData = z.infer<typeof ReceiptDataSchema>;

// Check payment data structure
export const CheckDataSchema = z.object({
  checkNumber: z.string(),
  amount: z.number(),
  date: z.string(),
  payee: z.string().optional(),
  memo: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type CheckData = z.infer<typeof CheckDataSchema>;

// Business card data structure
export const BusinessCardDataSchema = z.object({
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  website: z.string().optional(),
  linkedIn: z.string().optional(),
  twitter: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type BusinessCardData = z.infer<typeof BusinessCardDataSchema>;

// Pricing/rate card data structure for importing services from PDFs
export const PricingDataSchema = z.object({
  services: z.array(z.object({
    name: z.string(),
    code: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    basePrice: z.number(),
    priceUnit: z.string().optional(), // per sqft, per hour, each, etc.
  })),
  confidence: z.number().min(0).max(1),
});

export type PricingData = z.infer<typeof PricingDataSchema>;

// AI Provider interface
export interface AIProvider {
  name: string;
  parseInvoice(text: string): Promise<InvoiceData>;
  transcribe(audio: Buffer): Promise<string>;
  generateSpeech(text: string): Promise<Buffer>;
  extractReceipt(image: Buffer): Promise<ReceiptData>;
  extractCheck(image: Buffer): Promise<CheckData>;
  extractBusinessCard(image: Buffer): Promise<BusinessCardData>;
  extractPricing(imageOrPdf: Buffer): Promise<PricingData>;
}

// AI Provider config
export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}
