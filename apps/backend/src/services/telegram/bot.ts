import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from '../../utils/env';
import { aiRouter } from '../ai';
import logger from '../../utils/logger';
import * as commands from './commands';
import fetch from 'node-fetch';

/**
 * Production-Ready Telegram Bot
 * Full implementation with conversation state, voice processing, and error handling
 */

let bot: Telegraf | null = null;

if (env.TELEGRAM_BOT_TOKEN) {
  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COMMAND HANDLERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  bot.command('start', commands.handleStart);
  bot.command('help', commands.handleHelp);
  bot.command('new', commands.handleNew);
  bot.command('customers', commands.handleCustomers);
  bot.command('invoices', commands.handleInvoices);
  bot.command('stats', commands.handleStats);
  bot.command('pending', commands.handlePending);
  bot.command('cancel', commands.handleCancel);

  // Search with parameter
  bot.command('search', (ctx) => {
    const query = ctx.message.text.replace('/search', '').trim();
    commands.handleSearch(ctx, query);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VOICE MESSAGE HANDLER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  bot.on(message('voice'), async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      await ctx.reply('🎤 Transcribing your voice message...');

      const voice = ctx.message.voice;

      // Get file from Telegram
      const fileLink = await ctx.telegram.getFileLink(voice.file_id);

      // Download audio file
      const response = await fetch(fileLink.href);
      const audioBuffer = Buffer.from(await response.arrayBuffer());

      logger.info('Voice message received', {
        fileId: voice.file_id,
        duration: voice.duration,
        size: audioBuffer.length
      });

      // Transcribe using AI router (will try Whisper -> fallbacks)
      const transcription = await aiRouter.transcribe(audioBuffer);

      await ctx.reply(
        `📝 Transcription:\n\n"${transcription}"\n\n` +
        `Processing as invoice...`
      );

      // Process as text message (reuse text handler logic)
      const fakeContext = {
        ...ctx,
        message: {
          ...ctx.message,
          text: transcription
        }
      } as Context;

      await commands.handleTextMessage(fakeContext);

    } catch (error: any) {
      logger.error('Telegram voice error:', error);
      await ctx.reply(
        `❌ Voice processing failed.\n\n` +
        `Error: ${error.message}\n\n` +
        `Please try typing your message instead.`
      );
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TEXT MESSAGE HANDLER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  bot.on(message('text'), commands.handleTextMessage);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHOTO HANDLER (Receipt OCR)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  bot.on(message('photo'), async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      await ctx.reply('📷 Processing receipt image...');

      // Get the largest photo
      const photo = ctx.message.photo[ctx.message.photo.length - 1];

      // Get file from Telegram
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);

      // Download image
      const response = await fetch(fileLink.href);
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      logger.info('Photo received for OCR', {
        fileId: photo.file_id,
        size: imageBuffer.length
      });

      // Extract receipt data using AI vision
      const receiptData = await aiRouter.extractReceipt(imageBuffer);

      await ctx.reply(
        `✅ Receipt Extracted!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏪 Vendor: ${receiptData.vendor}\n` +
        `💰 Amount: $${receiptData.amount.toFixed(2)}\n` +
        `📅 Date: ${receiptData.date}\n` +
        `📁 Category: ${receiptData.category || 'N/A'}\n` +
        `🎯 Confidence: ${(receiptData.confidence * 100).toFixed(1)}%\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Reply "save" to save this receipt.`
      );

      // Store in conversation state for confirmation
      commands.conversationState.set(ctx.from.id, {
        step: 'awaiting_confirmation',
        data: { type: 'receipt', receiptData, imageBuffer }
      });

    } catch (error: any) {
      logger.error('Telegram photo OCR error:', error);
      await ctx.reply(
        `❌ Receipt processing failed.\n\n` +
        `Error: ${error.message}\n\n` +
        `Please try a clearer photo.`
      );
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ERROR HANDLING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  bot.catch((error: any, ctx: Context) => {
    logger.error('Telegram bot error:', {
      error: error.message,
      stack: error.stack,
      update: ctx.update
    });

    ctx.reply(
      `❌ An error occurred.\n\n` +
      `Please try again or use /help for assistance.`
    ).catch(() => {
      // Ignore errors when trying to send error message
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BOT INFO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  bot.telegram.getMe().then((botInfo) => {
    logger.info('✅ Telegram bot initialized', {
      username: botInfo.username,
      name: botInfo.first_name,
      id: botInfo.id
    });
  }).catch((error) => {
    logger.error('Failed to get bot info:', error);
  });

} else {
  logger.warn('⚠️  Telegram bot token not provided, bot disabled');
}

export { bot };

/**
 * Start the Telegram bot
 */
export function startTelegramBot() {
  if (bot) {
    bot.launch({
      dropPendingUpdates: true // Ignore old messages on startup
    }).then(() => {
      logger.info('🤖 Telegram bot started and listening for messages');
    }).catch((error) => {
      logger.error('Failed to start Telegram bot:', error);
    });
  }
}

/**
 * Stop the Telegram bot gracefully
 */
export function stopTelegramBot() {
  if (bot) {
    bot.stop('SIGINT');
    logger.info('🤖 Telegram bot stopped');
  }
}

/**
 * Set webhook for production deployment
 */
export async function setTelegramWebhook(webhookUrl: string) {
  if (bot) {
    try {
      await bot.telegram.setWebhook(webhookUrl);
      logger.info('✅ Telegram webhook set', { url: webhookUrl });
    } catch (error) {
      logger.error('Failed to set webhook:', error);
      throw error;
    }
  }
}

/**
 * Remove webhook (use for polling mode)
 */
export async function removeTelegramWebhook() {
  if (bot) {
    try {
      await bot.telegram.deleteWebhook();
      logger.info('✅ Telegram webhook removed');
    } catch (error) {
      logger.error('Failed to remove webhook:', error);
      throw error;
    }
  }
}
