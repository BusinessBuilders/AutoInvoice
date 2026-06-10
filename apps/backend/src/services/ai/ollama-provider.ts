import { Ollama } from 'ollama';
import { AIProvider, InvoiceData, ReceiptData, CheckData, BusinessCardData, PricingData, AIProviderConfig } from './types';
import { env } from '../../utils/env';
import logger from '../../utils/logger';

export class OllamaProvider implements AIProvider {
  name = 'ollama';
  private client: Ollama;
  private model: string;

  constructor(config?: AIProviderConfig) {
    this.client = new Ollama({
      host: config?.baseURL || env.OLLAMA_URL,
    });
    this.model = config?.model || env.OLLAMA_MODEL;
  }

  async parseInvoice(text: string): Promise<InvoiceData> {
    logger.info('Ollama: Parsing invoice from text');

    const systemPrompt = `You are an AI assistant that extracts invoice information from natural language.
Extract the following information and return ONLY a JSON object (no other text):
- Customer name
- Service date
- List of services with description, quantity, rate, and amount
- Any notes or special instructions

JSON structure:
{
  "customerName": "string",
  "serviceDate": "YYYY-MM-DD",
  "services": [{"description": "string", "quantity": number, "rate": number, "amount": number}],
  "notes": "string (optional)",
  "confidence": number (0-1)
}`;

    const response = await this.client.generate({
      model: this.model,
      prompt: `${systemPrompt}\n\nText to parse:\n${text}`,
      format: 'json',
    });

    const result = JSON.parse(response.response);
    logger.info('Ollama: Invoice parsed successfully', { confidence: result.confidence });

    return result as InvoiceData;
  }

  async transcribe(audio: Buffer): Promise<string> {
    // Ollama doesn't have built-in audio transcription
    logger.warn('Ollama: Audio transcription not supported, falling back');
    throw new Error('Audio transcription not supported by Ollama');
  }

  async generateSpeech(text: string): Promise<Buffer> {
    // Ollama doesn't have built-in TTS
    logger.warn('Ollama: Speech generation not supported, falling back');
    throw new Error('Speech generation not supported by Ollama');
  }

  async extractReceipt(image: Buffer): Promise<ReceiptData> {
    logger.info('Ollama: Extracting receipt data from image (using vision model)');

    const base64Image = image.toString('base64');

    const systemPrompt = `Extract receipt information from this image and return ONLY a JSON object:
{
  "vendor": "string",
  "amount": number,
  "date": "YYYY-MM-DD",
  "category": "string (optional)",
  "items": [{"description": "string", "amount": number}],
  "confidence": number (0-1)
}`;

    const response = await this.client.generate({
      model: 'llava', // Ollama vision model
      prompt: systemPrompt,
      images: [base64Image],
      format: 'json',
    });

    const result = JSON.parse(response.response);
    logger.info('Ollama: Receipt extracted successfully', { confidence: result.confidence });

    return result as ReceiptData;
  }

  async extractCheck(image: Buffer): Promise<CheckData> {
    logger.info('Ollama: Extracting check data from image (using vision model)');

    const base64Image = image.toString('base64');

    const systemPrompt = `Extract check payment information from this image and return ONLY a JSON object:
{
  "checkNumber": "string",
  "amount": number,
  "date": "YYYY-MM-DD",
  "payee": "string (optional)",
  "memo": "string (optional)",
  "confidence": number (0-1)
}

Extract:
- Check number (usually in top right or bottom)
- Payment amount (written numerically)
- Date (handle MM/DD/YY or MM/DD/YYYY formats)
- Payee name
- Memo if present`;

    const response = await this.client.generate({
      model: 'llava', // Ollama vision model
      prompt: systemPrompt,
      images: [base64Image],
      format: 'json',
    });

    const result = JSON.parse(response.response);
    logger.info('Ollama: Check extracted successfully', {
      checkNumber: result.checkNumber,
      amount: result.amount,
      confidence: result.confidence
    });

    return result as CheckData;
  }

  async extractBusinessCard(image: Buffer): Promise<BusinessCardData> {
    logger.info('Ollama: Extracting business card data from image (using vision model)');

    const base64Image = image.toString('base64');

    const systemPrompt = `Extract business card contact information from this image and return ONLY a JSON object:
{
  "name": "string",
  "phone": "string (optional)",
  "email": "string (optional)",
  "company": "string (optional)",
  "title": "string (optional)",
  "website": "string (optional)",
  "linkedIn": "string (optional)",
  "twitter": "string (optional)",
  "facebook": "string (optional)",
  "instagram": "string (optional)",
  "addressLine1": "string (optional)",
  "addressLine2": "string (optional)",
  "city": "string (optional)",
  "state": "string (optional)",
  "zipCode": "string (optional)",
  "country": "string (optional)",
  "confidence": number (0-1)
}

Extract all contact information from the business card. Look for:
- Full name
- Phone number (format consistently)
- Email address
- Company name
- Job title/position
- Website URL
- Social media handles
- Complete address if present`;

    const response = await this.client.generate({
      model: 'llava', // Ollama vision model
      prompt: systemPrompt,
      images: [base64Image],
      format: 'json',
    });

    const result = JSON.parse(response.response);
    logger.info('Ollama: Business card extracted successfully', {
      name: result.name,
      company: result.company,
      confidence: result.confidence
    });

    return result as BusinessCardData;
  }

  async extractPricing(imageOrPdf: Buffer): Promise<PricingData> {
    logger.info('Ollama: Extracting pricing data from document (using vision model)');

    const base64Image = imageOrPdf.toString('base64');

    const systemPrompt = `Extract service pricing and rate information from this pricing document and return ONLY a JSON object:
{
  "services": [
    {
      "name": "string (service name)",
      "code": "string (short uppercase code)",
      "category": "string (service category)",
      "description": "string (optional)",
      "basePrice": number (price per unit),
      "priceUnit": "string (per sqft, per hour, etc.)"
    }
  ],
  "confidence": number (0-1)
}

This is for a landscaping/snow removal business. Extract ALL services and their pricing.`;

    const response = await this.client.generate({
      model: 'llava', // Ollama vision model
      prompt: systemPrompt,
      images: [base64Image],
      format: 'json',
    });

    const result = JSON.parse(response.response);
    logger.info('Ollama: Pricing extracted successfully', {
      servicesCount: result.services?.length || 0,
      confidence: result.confidence
    });

    return result as PricingData;
  }
}
