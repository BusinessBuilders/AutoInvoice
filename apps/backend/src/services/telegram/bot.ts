import { Telegraf, Context } from 'telegraf';
import { env } from '../../utils/env';
import { aiRouter } from '../ai';
import { prisma } from '../../utils/db';
import logger from '../../utils/logger';

// Initialize bot only if token is provided
let bot: Telegraf | null = null;

if (env.TELEGRAM_BOT_TOKEN) {
  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  // Start command
  bot.command('start', (ctx: Context) => {
    ctx.reply(
      'Welcome to AutoInvoice! 🚀\n\n' +
        'I can help you create invoices using natural language.\n\n' +
        'Just tell me about your job, for example:\n' +
        '"Create an invoice for John Smith, mowed lawn today, $50"\n\n' +
        'Commands:\n' +
        '/help - Show this message\n' +
        '/status - Check invoice status\n' +
        '/customers - List your customers'
    );
  });

  // Help command
  bot.command('help', (ctx: Context) => {
    ctx.reply(
      'AutoInvoice Bot Help:\n\n' +
        '📝 Create Invoice: Just describe the job in natural language\n' +
        '📊 /status - View invoice statistics\n' +
        '👥 /customers - List all customers\n' +
        '🔍 /search <name> - Search for a customer\n\n' +
        'Example:\n' +
        '"Invoice for Mike, cleaned pool yesterday, $75"'
    );
  });

  // Handle text messages (invoice creation)
  bot.on('text', async (ctx: Context) => {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

    if (!text || text.startsWith('/')) {
      return; // Skip commands
    }

    try {
      ctx.reply('🤔 Processing your request...');

      // Parse invoice using AI
      const invoiceData = await aiRouter.parseInvoice(text);

      // TODO: Create conversation and invoice in database
      // For now, just show parsed data
      ctx.reply(
        `✅ Invoice parsed successfully!\n\n` +
          `Customer: ${invoiceData.customerName}\n` +
          `Date: ${invoiceData.serviceDate}\n` +
          `Confidence: ${(invoiceData.confidence * 100).toFixed(1)}%\n\n` +
          `Services:\n` +
          invoiceData.services
            .map((s) => `• ${s.description}: $${s.amount.toFixed(2)}`)
            .join('\n') +
          `\n\nReply "confirm" to create this invoice.`
      );
    } catch (error) {
      logger.error('Telegram bot error:', error);
      ctx.reply('❌ Sorry, I could not process that request. Please try again.');
    }
  });

  // Handle voice messages
  bot.on('voice', async (ctx: Context) => {
    try {
      ctx.reply('🎤 Transcribing voice message...');

      // TODO: Download and transcribe voice message
      ctx.reply('Voice message transcription is coming soon!');
    } catch (error) {
      logger.error('Telegram voice error:', error);
      ctx.reply('❌ Sorry, I could not process that voice message.');
    }
  });

  logger.info('✅ Telegram bot initialized');
} else {
  logger.warn('⚠️  Telegram bot token not provided, bot disabled');
}

export { bot };

// Start bot
export function startTelegramBot() {
  if (bot) {
    bot.launch();
    logger.info('🤖 Telegram bot started');
  }
}

// Stop bot gracefully
export function stopTelegramBot() {
  if (bot) {
    bot.stop('SIGINT');
    logger.info('🤖 Telegram bot stopped');
  }
}
