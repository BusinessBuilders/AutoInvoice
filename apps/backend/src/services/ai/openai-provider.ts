import OpenAI from 'openai';
import { AIProvider, InvoiceData, ReceiptData, CheckData, BusinessCardData, AIProviderConfig } from './types';
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

  private stripMarkdownCodeBlocks(content: string): string {
    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    // Handle multiple formats:
    // - ```json\n{...}\n```
    // - ```\n{...}\n```
    // - {... direct JSON ...}
    let cleaned = content.trim();

    // Remove opening code block with optional language specifier
    cleaned = cleaned.replace(/^```(?:json|typescript|javascript)?\s*/im, '');

    // Remove closing code block
    cleaned = cleaned.replace(/\s*```\s*$/m, '');

    // Remove any remaining backticks
    cleaned = cleaned.replace(/^`+|`+$/g, '');

    return cleaned.trim();
  }

  async parseInvoice(text: string): Promise<InvoiceData> {
    logger.info('OpenAI: Parsing invoice from text');

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are an expert AI assistant that extracts invoice information from natural, conversational language for a landscaping/snow removal business.

CRITICAL RULES - READ CAREFULLY:

1. CUSTOMER NAME EXTRACTION:
   - Can appear ANYWHERE in the text (beginning, middle, end)
   - May be just a name without "for" or "at": "Hawthorn it was a 3 inch snow storm..."
   - Can be a person, company, or property name
   - Look for capitalized words that seem like names
   - If uncertain, extract the most likely customer name

2. LOCATION/ADDRESS EXTRACTION:
   - Look for "at", "on", "@" followed by an address or location
   - Examples: "at 123 Main Street", "on Oak Avenue", "at the office building"
   - Can be full address: "123 Main St, Springfield"
   - Can be partial: "the Smith residence", "office building on Oak Ave"
   - Can be property name: "at Greenfield Plaza", "at the warehouse"
   - If no location mentioned, leave blank

3. DATE EXTRACTION:
   - "today" = ${today}
   - "yesterday" = calculate yesterday
   - Specific dates = parse to YYYY-MM-DD
   - NO date mentioned = default to ${today}
   - Ignore weather context (like "3 inch snow storm") - NOT a date

3. SERVICE IDENTIFICATION (MOST IMPORTANT):
   Extract ONLY billable work/services. Each distinct service gets its own entry.

   Service Detection Rules:
   - Action verbs indicate services: plowed, salted, mowed, raked, hydroseeded, trimmed, etc.
   - "and" between different actions = separate services
   - Same action on different targets = separate services (walks vs parking lot)
   - Ignore non-billable context: weather conditions, conversations, explanations

   Quantity Patterns (pay close attention):
   - "X times" or "X x" = quantity X for that service
   - "twice" = 2, "thrice" = 3
   - "X tanks of" = quantity X
   - "total of X" = quantity X
   - Numbers with units (sqft, hours, acres, tanks) = that number
   - If multiple services mentioned but quantity only for some, default others to 1

   Complex Examples:
   Input: "raked and hydroseeded total of 3 tanks of hydroseed"
   → Service 1: "raking" qty 1
   → Service 2: "hydroseed" qty 3

   Input: "salted the walks 3 times and salted the parking lot 2 times"
   → Service 1: "salt walks" qty 3
   → Service 2: "salt parking lot" qty 2

   Input: "plowed this driveway"
   → Service 1: "plowing driveway" qty 1

   Input: "mowed lawn twice, trimmed hedges and cleaned up"
   → Service 1: "mowing lawn" qty 2
   → Service 2: "trimming hedges" qty 1
   → Service 3: "cleanup" qty 1

4. CONFIDENCE SCORING:
   - 0.9-1.0: Customer clear, services clear, quantities clear
   - 0.7-0.9: Most things clear, minor ambiguity
   - 0.5-0.7: Some ambiguity in services or quantities
   - <0.5: Very unclear or missing critical info

5. DESCRIPTION WRITING:
   - Keep descriptions SHORT and clear (2-4 words)
   - Focus on the ACTION + TARGET: "salt walks", "plow driveway", "mow lawn"
   - Don't include quantities in description (that's in the quantity field)

Return JSON structure:
{
  "customerName": "string",
  "serviceDate": "YYYY-MM-DD",
  "serviceLocation": "string (optional - address/location where work was performed)",
  "services": [
    {
      "description": "string (brief: action + target)",
      "quantity": number,
      "rate": number (rate per unit in dollars - extract from text if mentioned, otherwise 0),
      "amount": number (quantity * rate)
    }
  ],

  PRICING EXTRACTION RULES:
  - Extract ANY dollar amount mentioned in the text (with or without "per", "each", etc.)
  - Look for $ sign followed by a number - that's the price
  - "10 cents per sqft" → rate: 0.10
  - ".10 cents per sqft" or "$0.10 cents per sqft" → rate: 0.10
  - "$5 per hour" → rate: 5.00
  - "$750" or "$1200.50" → rate: 750.00 or 1200.50 (extract any dollar amount)
  - If multiple dollar amounts, use the one that makes sense as unit price
  - If no pricing mentioned → rate: 0
  "notes": "string (optional - include relevant context like snow storm details)",
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

    // Ensure serviceDate defaults to today if invalid
    if (!result.serviceDate || result.serviceDate === 'Invalid Date') {
      result.serviceDate = today;
      logger.warn('OpenAI: Invalid or missing service date, defaulting to today');
    }

    logger.info('OpenAI: Invoice parsed successfully', {
      confidence: result.confidence,
      servicesCount: result.services?.length || 0,
      serviceDate: result.serviceDate
    });

    return result as InvoiceData;
  }

  async transcribe(audio: Buffer): Promise<string> {
    logger.info('OpenAI: Transcribing audio');

    const file = new File([new Uint8Array(audio)], 'audio.mp3', { type: 'audio/mpeg' });
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
      model: this.model, // Use configured model (gpt-4o has vision capabilities)
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
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    let content = completion.choices[0].message.content || '{}';

    // Strip markdown code blocks if present
    content = this.stripMarkdownCodeBlocks(content);

    const result = JSON.parse(content);
    logger.info('OpenAI: Receipt extracted successfully', { confidence: result.confidence });

    return result as ReceiptData;
  }

  async extractCheck(image: Buffer): Promise<CheckData> {
    logger.info('OpenAI: Extracting check data from image');

    const base64Image = image.toString('base64');

    const systemPrompt = `You are an AI assistant that extracts check payment information from images.
Extract the following information from the check:
- Check number (usually in top right or bottom)
- Payment amount (written numerically and in words)
- Date written on the check
- Payee (Pay to the order of)
- Memo line (if present)

Return a JSON object with this structure:
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

    const completion = await this.client.chat.completions.create({
      model: this.model, // Use configured model (gpt-4o has vision capabilities)
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
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    let content = completion.choices[0].message.content || '{}';

    // Strip markdown code blocks if present
    content = this.stripMarkdownCodeBlocks(content);

    const result = JSON.parse(content);
    logger.info('OpenAI: Check extracted successfully', {
      checkNumber: result.checkNumber,
      amount: result.amount,
      confidence: result.confidence
    });

    return result as CheckData;
  }

  async extractBusinessCard(image: Buffer): Promise<BusinessCardData> {
    logger.info('OpenAI: Extracting business card data from image');

    const base64Image = image.toString('base64');

    const systemPrompt = `You are an AI assistant that extracts contact information from business card images.

Extract all available information from the business card:
- Full name (first and last)
- Phone number(s) - format consistently, include country code if visible
- Email address(es)
- Company name
- Job title/position
- Website URL
- Social media handles or URLs (LinkedIn, Twitter, Facebook, Instagram)
- Full address (street, city, state, zip, country)

Return a JSON object with this structure:
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

    const completion = await this.client.chat.completions.create({
      model: this.model,
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
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    let content = completion.choices[0].message.content || '{}';

    // Strip markdown code blocks if present
    content = this.stripMarkdownCodeBlocks(content);

    const result = JSON.parse(content);
    logger.info('OpenAI: Business card extracted successfully', {
      name: result.name,
      confidence: result.confidence
    });

    return result as BusinessCardData;
  }
}
