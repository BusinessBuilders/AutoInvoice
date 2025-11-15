import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, InvoiceData, ReceiptData, AIProviderConfig } from './types';
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
}
