import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, InvoiceData, ReceiptData, CheckData, BusinessCardData, PricingData, AIProviderConfig } from './types';
import { env } from '../../utils/env';
import logger from '../../utils/logger';

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(config?: AIProviderConfig) {
    this.client = new Anthropic({
      apiKey: config?.apiKey || env.ANTHROPIC_API_KEY,
    });
    this.model = config?.model || env.ANTHROPIC_MODEL;
  }

  async parseInvoice(text: string): Promise<InvoiceData> {
    logger.info('Anthropic: Parsing invoice from text');

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

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\nText to parse:\n${text}`,
        },
      ],
    });

    const content = message.content[0];
    const result = JSON.parse(content.type === 'text' ? content.text : '{}');
    logger.info('Anthropic: Invoice parsed successfully', { confidence: result.confidence });

    return result as InvoiceData;
  }

  async transcribe(audio: Buffer): Promise<string> {
    // Anthropic doesn't have built-in audio transcription
    // This would need to use a different service or return an error
    logger.warn('Anthropic: Audio transcription not supported, falling back');
    throw new Error('Audio transcription not supported by Anthropic');
  }

  async generateSpeech(text: string): Promise<Buffer> {
    // Anthropic doesn't have built-in TTS
    logger.warn('Anthropic: Speech generation not supported, falling back');
    throw new Error('Speech generation not supported by Anthropic');
  }

  async extractReceipt(image: Buffer): Promise<ReceiptData> {
    logger.info('Anthropic: Extracting receipt data from image');

    const base64Image = image.toString('base64');

    const systemPrompt = `You are an AI assistant that extracts receipt information from images.
Extract the following information and return ONLY a JSON object (no other text):
- Vendor name
- Total amount
- Date
- Category (if identifiable)
- List of items with description and amount

JSON structure:
{
  "vendor": "string",
  "amount": number,
  "date": "YYYY-MM-DD",
  "category": "string (optional)",
  "items": [{"description": "string", "amount": number}],
  "confidence": number (0-1)
}`;

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: systemPrompt,
            },
          ],
        },
      ],
    });

    const content = message.content[0];
    const result = JSON.parse(content.type === 'text' ? content.text : '{}');
    logger.info('Anthropic: Receipt extracted successfully', { confidence: result.confidence });

    return result as ReceiptData;
  }

  async extractCheck(image: Buffer): Promise<CheckData> {
    logger.info('Anthropic: Extracting check data from image');

    const base64Image = image.toString('base64');

    const systemPrompt = `You are an AI assistant that extracts check payment information from images.
Extract the following information from the check and return ONLY a JSON object (no other text):
- Check number (usually in top right or bottom)
- Payment amount (written numerically and in words)
- Date written on the check
- Payee (Pay to the order of)
- Memo line (if present)

JSON structure:
{
  "checkNumber": "string",
  "amount": number,
  "date": "YYYY-MM-DD",
  "payee": "string (optional)",
  "memo": "string (optional)",
  "confidence": number (0-1)
}

Be careful to:
- Extract the numeric amount accurately
- Parse the date correctly (handle various formats like MM/DD/YY, MM/DD/YYYY)
- Identify the check number (usually 3-4 digits)
- Set confidence based on image clarity and data completeness`;

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: systemPrompt,
            },
          ],
        },
      ],
    });

    const content = message.content[0];
    const result = JSON.parse(content.type === 'text' ? content.text : '{}');
    logger.info('Anthropic: Check extracted successfully', {
      checkNumber: result.checkNumber,
      amount: result.amount,
      confidence: result.confidence
    });

    return result as CheckData;
  }

  async extractBusinessCard(image: Buffer): Promise<BusinessCardData> {
    logger.info('Anthropic: Extracting business card data from image');

    const base64Image = image.toString('base64');

    const systemPrompt = `You are an AI assistant that extracts contact information from business card images.

Extract all available information from the business card and return ONLY a JSON object (no other text):
- Full name (first and last)
- Phone number(s) - format consistently, include country code if visible
- Email address(es)
- Company name
- Job title/position
- Website URL
- Social media handles or URLs (LinkedIn, Twitter, Facebook, Instagram)
- Full address (street, city, state, zip, country)

JSON structure:
{
  "name": "string",
  "phone": "string (optional)",
  "email": "string (optional)",
  "company": "string (optional)",
  "title": "string (optional)",
  "website": "string (optional)",
  "linkedIn": "string (optional, full URL or username)",
  "twitter": "string (optional, handle or URL)",
  "facebook": "string (optional, URL)",
  "instagram": "string (optional, handle or URL)",
  "addressLine1": "string (optional)",
  "addressLine2": "string (optional)",
  "city": "string (optional)",
  "state": "string (optional)",
  "zipCode": "string (optional)",
  "country": "string (optional)",
  "confidence": number (0-1, based on image quality and data completeness)
}

Important notes:
- Extract exactly what you see on the card
- For social media, extract the username or full URL if visible
- If multiple phone numbers or emails exist, choose the primary/first one
- Set confidence based on image clarity and how much information was successfully extracted`;

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: systemPrompt,
            },
          ],
        },
      ],
    });

    const content = message.content[0];
    const result = JSON.parse(content.type === 'text' ? content.text : '{}');
    logger.info('Anthropic: Business card extracted successfully', {
      name: result.name,
      confidence: result.confidence
    });

    return result as BusinessCardData;
  }

  async extractPricing(imageOrPdf: Buffer): Promise<PricingData> {
    logger.info('Anthropic: Extracting pricing data from document');

    const base64Image = imageOrPdf.toString('base64');

    const systemPrompt = `You are an AI assistant that extracts service pricing and rate information from pricing documents.

This is for a landscaping/snow removal business. Extract all services and their pricing.

Return ONLY a JSON object:
{
  "services": [
    {
      "name": "string (service name)",
      "code": "string (short uppercase code, e.g., HYDROSEED)",
      "category": "string (service category)",
      "description": "string (optional)",
      "basePrice": number (price per unit),
      "priceUnit": "string (per sqft, per hour, each, etc.)"
    }
  ],
  "confidence": number (0-1)
}

Extract ALL services, generate codes if not provided, standardize price units.`;

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: systemPrompt,
            },
          ],
        },
      ],
    });

    const content = message.content[0];
    const result = JSON.parse(content.type === 'text' ? content.text : '{}');
    logger.info('Anthropic: Pricing extracted successfully', {
      servicesCount: result.services?.length || 0,
      confidence: result.confidence
    });

    return result as PricingData;
  }
}
