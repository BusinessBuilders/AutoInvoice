import { Ollama } from 'ollama';
import { AIProvider, InvoiceData, ReceiptData, CheckData, AIProviderConfig } from './types';
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
}
