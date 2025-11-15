import { z } from 'zod';

// Parsed invoice data structure
export const InvoiceDataSchema = z.object({
  customerName: z.string(),
  serviceDate: z.string(),
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

// AI Provider interface
export interface AIProvider {
  name: string;
  parseInvoice(text: string): Promise<InvoiceData>;
  transcribe(audio: Buffer): Promise<string>;
  generateSpeech(text: string): Promise<Buffer>;
  extractReceipt(image: Buffer): Promise<ReceiptData>;
}

// AI Provider config
export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}
