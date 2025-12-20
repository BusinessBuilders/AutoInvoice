import { AIProvider, InvoiceData, ReceiptData, CheckData, BusinessCardData } from './types';
import { OpenAIProvider } from './openai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OllamaProvider } from './ollama-provider';
import logger from '../../utils/logger';
import { prisma } from '../../utils/db';

export type AITask = 'parseInvoice' | 'transcribe' | 'generateSpeech' | 'extractReceipt' | 'extractCheck' | 'extractBusinessCard';

export class AIRouter {
  private providers: Map<string, AIProvider>;
  private defaultFallbackChain: string[];

  constructor() {
    this.providers = new Map();
    this.defaultFallbackChain = ['openai', 'anthropic', 'ollama'];

    // Initialize providers
    try {
      this.providers.set('openai', new OpenAIProvider());
      logger.info('OpenAI provider initialized');
    } catch (error) {
      logger.warn('Failed to initialize OpenAI provider', { error });
    }

    try {
      this.providers.set('anthropic', new AnthropicProvider());
      logger.info('Anthropic provider initialized');
    } catch (error) {
      logger.warn('Failed to initialize Anthropic provider', { error });
    }

    try {
      this.providers.set('ollama', new OllamaProvider());
      logger.info('Ollama provider initialized');
    } catch (error) {
      logger.warn('Failed to initialize Ollama provider', { error });
    }
  }

  async execute<T>(
    task: AITask,
    args: any[],
    fallbackChain: string[] = this.defaultFallbackChain
  ): Promise<T> {
    const errors: Array<{ provider: string; error: Error }> = [];
    const startTime = Date.now();

    for (const providerName of fallbackChain) {
      const provider = this.providers.get(providerName);

      if (!provider) {
        logger.warn(`Provider ${providerName} not available, skipping`);
        continue;
      }

      try {
        logger.info(`Attempting ${task} with provider: ${providerName}`);

        // Execute the task
        const result = await (provider[task] as any)(...args);
        const latencyMs = Date.now() - startTime;

        // Log successful interaction
        await this.logInteraction({
          provider: providerName,
          task,
          input: JSON.stringify(args),
          output: result,
          success: true,
          latencyMs,
        });

        logger.info(`${task} completed successfully with ${providerName}`, { latencyMs });
        return result;
      } catch (error) {
        logger.error(`${task} failed with ${providerName}`, { error });
        errors.push({
          provider: providerName,
          error: error as Error,
        });

        // Log failed interaction
        await this.logInteraction({
          provider: providerName,
          task,
          input: JSON.stringify(args),
          output: null,
          success: false,
          error: (error as Error).message,
          latencyMs: Date.now() - startTime,
        });
      }
    }

    // All providers failed
    const errorMessage = `All AI providers failed for task: ${task}. Errors: ${errors
      .map((e) => `${e.provider}: ${e.error.message}`)
      .join(', ')}`;

    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  async parseInvoice(text: string, fallbackChain?: string[]): Promise<InvoiceData> {
    return this.execute<InvoiceData>('parseInvoice', [text], fallbackChain);
  }

  async transcribe(audio: Buffer, fallbackChain?: string[]): Promise<string> {
    return this.execute<string>('transcribe', [audio], fallbackChain);
  }

  async generateSpeech(text: string, fallbackChain?: string[]): Promise<Buffer> {
    return this.execute<Buffer>('generateSpeech', [text], fallbackChain);
  }

  async extractReceipt(image: Buffer, fallbackChain?: string[]): Promise<ReceiptData> {
    return this.execute<ReceiptData>('extractReceipt', [image], fallbackChain);
  }

  async extractCheck(image: Buffer, fallbackChain?: string[]): Promise<CheckData> {
    return this.execute<CheckData>('extractCheck', [image], fallbackChain);
  }

  async extractBusinessCard(image: Buffer, fallbackChain?: string[]): Promise<BusinessCardData> {
    return this.execute<BusinessCardData>('extractBusinessCard', [image], fallbackChain);
  }

  private async logInteraction(data: {
    provider: string;
    task: string;
    input: string;
    output: any;
    success: boolean;
    error?: string;
    latencyMs: number;
  }) {
    try {
      await prisma.aIInteraction.create({
        data: {
          provider: data.provider,
          model: data.provider, // Could be more specific
          input: data.input,
          output: data.output ? JSON.parse(JSON.stringify(data.output)) : {},
          success: data.success,
          error: data.error,
          latencyMs: data.latencyMs,
        },
      });
    } catch (error) {
      logger.error('Failed to log AI interaction', { error });
    }
  }
}

// Export singleton instance
export const aiRouter = new AIRouter();
