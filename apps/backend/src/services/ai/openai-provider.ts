import OpenAI from 'openai';
import { AIProvider, InvoiceData, ReceiptData, AIProviderConfig } from './types';
import { env } from '../../utils/env';
import logger from '../../utils/logger';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(config?: AIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config?.apiKey || env.OPENAI_API_KEY,
    });
    this.model = config?.model || env.OPENAI_MODEL;
  }

  async parseInvoice(text: string): Promise<InvoiceData> {
    logger.info('OpenAI: Parsing invoice from text');

    const systemPrompt = `You are an AI assistant that extracts invoice information from natural language.
Extract the following information:
- Customer name
- Service date
- List of services with description, quantity, rate, and amount
- Any notes or special instructions

Return a JSON object with this structure:
{
  "customerName": "string",
  "serviceDate": "YYYY-MM-DD",
  "services": [
    {
      "description": "string",
      "quantity": number,
      "rate": number,
      "amount": number
    }
  ],
  "notes": "string (optional)",
  "confidence": number (0-1)
}`;

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    logger.info('OpenAI: Invoice parsed successfully', { confidence: result.confidence });

    return result as InvoiceData;
  }

  async transcribe(audio: Buffer): Promise<string> {
    logger.info('OpenAI: Transcribing audio');

    const file = new File([audio], 'audio.mp3', { type: 'audio/mpeg' });
    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });

    logger.info('OpenAI: Audio transcribed successfully');
    return transcription.text;
  }

  async generateSpeech(text: string): Promise<Buffer> {
    logger.info('OpenAI: Generating speech');

    const mp3 = await this.client.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    logger.info('OpenAI: Speech generated successfully');

    return buffer;
  }

  async extractReceipt(image: Buffer): Promise<ReceiptData> {
    logger.info('OpenAI: Extracting receipt data from image');

    const base64Image = image.toString('base64');

    const systemPrompt = `You are an AI assistant that extracts receipt information from images.
Extract the following information:
- Vendor name
- Total amount
- Date
- Category (if identifiable)
- List of items with description and amount

Return a JSON object with this structure:
{
  "vendor": "string",
  "amount": number,
  "date": "YYYY-MM-DD",
  "category": "string (optional)",
  "items": [
    {
      "description": "string",
      "amount": number
    }
  ],
  "confidence": number (0-1)
}`;

    const completion = await this.client.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    logger.info('OpenAI: Receipt extracted successfully', { confidence: result.confidence });

    return result as ReceiptData;
  }
}
