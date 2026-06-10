import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { aiRouter } from '../services/ai/router';
import * as smartTemplates from '../services/smart-templates';
import logger from '../utils/logger';
import { TallyStatus } from '@prisma/client';
import OpenAI from 'openai';

// Intent classification tools for function calling
const voiceIntentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'add_line_items',
      description: 'Add line items to the tally or create an invoice. Use when user describes work done, services, quantities, or prices.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The original text to parse for line items' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize_tally',
      description: 'Close the open tally and create an invoice. Use when user says things like "create the invoice", "finalize", "close it out", "that\'s all", "done", "send the invoice", "make the bill".',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Optional customer ID if mentioned' },
          customerName: { type: 'string', description: 'Customer name if mentioned' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_tally',
      description: 'Cancel or delete the current tally without creating an invoice. Use when user says "cancel", "delete", "nevermind", "forget it".',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Optional customer ID' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tallies',
      description: 'List open tallies. Use when user asks "what tallies do I have", "show tallies", "open invoices".',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

// Classify intent using OpenAI function calling
async function classifyVoiceIntent(text: string): Promise<{
  intent: 'add_line_items' | 'finalize_tally' | 'cancel_tally' | 'list_tallies';
  args: Record<string, any>;
}> {
  const openai = new OpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an invoice assistant. Classify the user\'s voice command and call the appropriate function. If they describe work/services/quantities, use add_line_items. If they want to finalize/create/send the invoice, use finalize_tally.',
      },
      { role: 'user', content: text },
    ],
    tools: voiceIntentTools,
    tool_choice: 'required',
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    // Default to add_line_items if no clear intent
    return { intent: 'add_line_items', args: { text } };
  }

  return {
    intent: toolCall.function.name as any,
    args: JSON.parse(toolCall.function.arguments || '{}'),
  };
}

export const voiceRouter = router({
  /**
   * Transcribe audio to text
   */
  transcribe: protectedProcedure
    .input(z.object({
      audioBase64: z.string(),
    }))
    .mutation(async ({ input }) => {
      const audioBuffer = Buffer.from(input.audioBase64, 'base64');

      logger.info('Voice: Transcribing audio', { size: audioBuffer.length });

      const transcription = await aiRouter.transcribe(audioBuffer);

      logger.info('Voice: Transcription complete', {
        length: transcription.length,
        preview: transcription.substring(0, 50)
      });

      return { text: transcription };
    }),

  /**
   * Generate speech from text (TTS)
   */
  speak: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(1000),
    }))
    .mutation(async ({ input }) => {
      logger.info('Voice: Generating speech', { text: input.text.substring(0, 50) });

      const audioBuffer = await aiRouter.generateSpeech(input.text);
      const audioBase64 = audioBuffer.toString('base64');

      logger.info('Voice: Speech generated', { size: audioBuffer.length });

      return { audioBase64 };
    }),

  /**
   * Full workflow: transcribe → classify intent → execute action → generate confirmation
   */
  process: protectedProcedure
    .input(z.object({
      audioBase64: z.string(),
      mode: z.enum(['tally', 'immediate']).default('tally'),
      customerId: z.string().optional(),
      tallyId: z.string().optional(),
      jobName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Step 1: Transcribe audio
      const audioBuffer = Buffer.from(input.audioBase64, 'base64');
      logger.info('Voice process: Transcribing', { size: audioBuffer.length });

      const transcription = await aiRouter.transcribe(audioBuffer);
      logger.info('Voice process: Transcribed', { text: transcription });

      // Step 2: Classify intent using function calling
      const { intent, args } = await classifyVoiceIntent(transcription);
      logger.info('Voice process: Intent classified', { intent, args });

      // Handle command intents
      if (intent === 'finalize_tally') {
        // Find the open tally (by customer name if provided, or use selected customer)
        let customerId = input.customerId;

        if (args.customerName && !customerId) {
          // Try to find customer by name
          const customer = await ctx.prisma.customer.findFirst({
            where: {
              OR: [
                { name: { contains: args.customerName, mode: 'insensitive' } },
                { nickname: { has: args.customerName } },
              ],
            },
          });
          customerId = customer?.id;
        }

        // Find the open tally
        const tally = await ctx.prisma.tallyInvoice.findFirst({
          where: {
            userId,
            status: TallyStatus.OPEN,
            ...(customerId ? { customerId } : {}),
          },
          include: {
            customer: true,
            tallyItems: { orderBy: { order: 'asc' } },
          },
          orderBy: { updatedAt: 'desc' },
        });

        if (!tally) {
          const noTallyText = customerId
            ? "No open tally found for that customer."
            : "No open tallies to finalize.";
          const noTallyAudio = await aiRouter.generateSpeech(noTallyText);
          return {
            transcription,
            parsed: null,
            action: 'no_tally',
            confirmation: { text: noTallyText, audioBase64: noTallyAudio.toString('base64') },
          };
        }

        if (tally.tallyItems.length === 0) {
          const emptyText = `${tally.customer.name}'s tally is empty. Add some items first.`;
          const emptyAudio = await aiRouter.generateSpeech(emptyText);
          return {
            transcription,
            parsed: null,
            action: 'empty_tally',
            confirmation: { text: emptyText, audioBase64: emptyAudio.toString('base64') },
          };
        }

        // Generate invoice number
        const lastInvoice = await ctx.prisma.invoice.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { invoiceNumber: true },
        });
        const lastNumber = lastInvoice
          ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
          : 0;
        const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

        const subtotal = Number(tally.subtotal);
        const serviceDates = tally.tallyItems.map(i => i.serviceDate);
        const serviceDate = serviceDates.reduce((a, b) => a < b ? a : b);

        // Create the invoice
        const invoice = await ctx.prisma.invoice.create({
          data: {
            invoiceNumber,
            userId,
            customerId: tally.customerId,
            locationId: tally.locationId,
            serviceAddress: tally.serviceAddress,
            serviceDate,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            subtotal,
            taxRate: 0,
            taxAmount: 0,
            discount: 0,
            total: subtotal,
            notes: `Created from voice tally`,
            source: 'voice',
            lineItems: {
              create: tally.tallyItems.map((item, index) => ({
                serviceId: item.serviceId,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                rate: item.rate,
                amount: item.amount,
                order: index,
              })),
            },
          },
          include: { customer: true, lineItems: true },
        });

        // Mark tally as finalized
        await ctx.prisma.tallyInvoice.update({
          where: { id: tally.id },
          data: {
            status: TallyStatus.FINALIZED,
            convertedToInvoiceId: invoice.id,
            convertedAt: new Date(),
          },
        });

        const confirmText = `Created invoice ${invoiceNumber} for ${tally.customer.name}. Total is $${subtotal.toFixed(2)}.`;
        const confirmAudio = await aiRouter.generateSpeech(confirmText);

        logger.info('Voice process: Finalized tally', { tallyId: tally.id, invoiceId: invoice.id });

        return {
          transcription,
          parsed: null,
          action: 'finalized_tally',
          data: { invoice, tally },
          confirmation: { text: confirmText, audioBase64: confirmAudio.toString('base64') },
        };
      }

      if (intent === 'cancel_tally') {
        const tally = await ctx.prisma.tallyInvoice.findFirst({
          where: { userId, status: TallyStatus.OPEN },
          include: { customer: true },
          orderBy: { updatedAt: 'desc' },
        });

        if (!tally) {
          const noTallyText = "No open tally to cancel.";
          const noTallyAudio = await aiRouter.generateSpeech(noTallyText);
          return {
            transcription,
            parsed: null,
            action: 'no_tally',
            confirmation: { text: noTallyText, audioBase64: noTallyAudio.toString('base64') },
          };
        }

        await ctx.prisma.tallyInvoice.update({
          where: { id: tally.id },
          data: { status: TallyStatus.CANCELLED },
        });

        const cancelText = `Cancelled ${tally.customer.name}'s tally.`;
        const cancelAudio = await aiRouter.generateSpeech(cancelText);

        return {
          transcription,
          parsed: null,
          action: 'cancelled_tally',
          confirmation: { text: cancelText, audioBase64: cancelAudio.toString('base64') },
        };
      }

      if (intent === 'list_tallies') {
        const tallies = await ctx.prisma.tallyInvoice.findMany({
          where: { userId, status: TallyStatus.OPEN },
          include: { customer: true },
          orderBy: { updatedAt: 'desc' },
        });

        let listText: string;
        if (tallies.length === 0) {
          listText = "You have no open tallies.";
        } else {
          const tallyDescs = tallies.map(t =>
            `${t.customer.name}: $${Number(t.subtotal).toFixed(2)}`
          ).join(', ');
          listText = `You have ${tallies.length} open ${tallies.length === 1 ? 'tally' : 'tallies'}: ${tallyDescs}`;
        }

        const listAudio = await aiRouter.generateSpeech(listText);

        return {
          transcription,
          parsed: null,
          action: 'listed_tallies',
          data: { tallies },
          confirmation: { text: listText, audioBase64: listAudio.toString('base64') },
        };
      }

      // Default: add_line_items - Parse and add to tally
      const parsed = await smartTemplates.parseQuickInvoice({
        text: transcription,
        userId,
        autoCreateCustomer: false,
        autoCreateService: false,
      });

      if (!parsed.lineItems || parsed.lineItems.length === 0) {
        const errorText = "I couldn't understand that. Please try again.";
        const errorAudio = await aiRouter.generateSpeech(errorText);

        return {
          transcription,
          parsed: null,
          action: 'error',
          confirmation: {
            text: errorText,
            audioBase64: errorAudio.toString('base64'),
          },
        };
      }

      // Determine customer
      let customerId: string | undefined = input.customerId || parsed.customer?.id;
      const customerName = parsed.customer?.name || parsed.pendingCustomer || 'Unknown';

      // Verify customer exists in database
      if (customerId) {
        const customerExists = await ctx.prisma.customer.findUnique({
          where: { id: customerId },
          select: { id: true },
        });
        if (!customerExists) {
          customerId = undefined; // Customer ID is invalid
        }
      }

      // If no valid customer, check if we should auto-create
      if (!customerId && (parsed.pendingCustomer || customerName !== 'Unknown')) {
        // Auto-create the customer from voice
        const newCustomer = await ctx.prisma.customer.create({
          data: {
            userId,
            name: parsed.pendingCustomer || customerName,
            nickname: [parsed.pendingCustomer || customerName],
          },
        });
        customerId = newCustomer.id;
        logger.info('Voice: Auto-created customer', { name: newCustomer.name, id: newCustomer.id });
      }

      if (!customerId) {
        // No customer identified - ask for clarification
        const clarifyText = `I parsed ${parsed.lineItems.length} items but couldn't identify the customer. Please specify a customer.`;
        const clarifyAudio = await aiRouter.generateSpeech(clarifyText);

        return {
          transcription,
          parsed,
          action: 'needs_customer',
          confirmation: {
            text: clarifyText,
            audioBase64: clarifyAudio.toString('base64'),
          },
        };
      }

      // Step 3: Execute action based on mode
      let resultAction: string;
      let resultData: any;

      if (input.mode === 'tally') {
        // Get or create tally for customer
        let tally = await ctx.prisma.tallyInvoice.findFirst({
          where: {
            customerId,
            userId,
            status: TallyStatus.OPEN,
          },
        });

        if (!tally) {
          tally = await ctx.prisma.tallyInvoice.create({
            data: {
              customerId,
              userId,
              status: TallyStatus.OPEN,
              source: 'voice',
              serviceAddress: input.jobName || undefined,
            },
          });
        }

        // Add items to tally
        const currentItemCount = await ctx.prisma.tallyItem.count({
          where: { tallyInvoiceId: tally.id },
        });

        for (let i = 0; i < parsed.lineItems.length; i++) {
          const item = parsed.lineItems[i];
          await ctx.prisma.tallyItem.create({
            data: {
              tallyInvoiceId: tally.id,
              serviceId: item.service?.id || null,
              description: item.service?.name || item.description || 'Unnamed item',
              quantity: item.quantity,
              unit: item.unit,
              rate: item.rate,
              amount: item.amount,
              serviceDate: new Date(parsed.date),
              source: 'voice',
              rawInput: transcription,
              order: currentItemCount + i,
            },
          });
        }

        // Update tally totals
        const updatedTally = await ctx.prisma.tallyInvoice.update({
          where: { id: tally.id },
          data: {
            subtotal: { increment: parsed.total },
            itemCount: { increment: parsed.lineItems.length },
          },
          include: {
            customer: true,
          },
        });

        resultAction = 'added_to_tally';
        resultData = { tally: updatedTally };
      } else {
        // Immediate mode - create invoice directly
        const lastInvoice = await ctx.prisma.invoice.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { invoiceNumber: true },
        });
        const lastNumber = lastInvoice
          ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
          : 0;
        const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

        const invoice = await ctx.prisma.invoice.create({
          data: {
            invoiceNumber,
            userId,
            customerId,
            serviceDate: new Date(parsed.date),
            dueDate: new Date(parsed.date), // Due on receipt
            serviceAddress: input.jobName || undefined,
            subtotal: parsed.total,
            taxRate: 0,
            taxAmount: 0,
            discount: 0,
            total: parsed.total,
            notes: `Created via voice input`,
            source: 'voice',
            lineItems: {
              create: parsed.lineItems.map((item, index) => ({
                serviceId: item.service?.id || null,
                description: item.service?.name || item.description || 'Unnamed item',
                quantity: item.quantity,
                unit: item.unit,
                rate: item.rate,
                amount: item.amount,
                order: index,
              })),
            },
          },
          include: {
            customer: true,
            lineItems: true,
          },
        });

        resultAction = 'created_invoice';
        resultData = { invoice };
      }

      // Step 4: Generate confirmation
      const itemDesc = parsed.lineItems
        .map(i => `${i.quantity} ${i.unit || 'units'} ${i.description}`)
        .join(', ');

      let confirmationText: string;
      if (resultAction === 'added_to_tally') {
        const tally = resultData.tally;
        confirmationText = `Added ${itemDesc} for ${customerName}. Tally total is now $${Number(tally.subtotal).toFixed(2)}.`;
      } else {
        const invoice = resultData.invoice;
        confirmationText = `Created invoice ${invoice.invoiceNumber} for ${customerName}. Total is $${Number(invoice.total).toFixed(2)}.`;
      }

      const confirmationAudio = await aiRouter.generateSpeech(confirmationText);

      logger.info('Voice process: Complete', {
        action: resultAction,
        customerId,
        itemCount: parsed.lineItems.length,
      });

      return {
        transcription,
        parsed,
        action: resultAction,
        data: resultData,
        confirmation: {
          text: confirmationText,
          audioBase64: confirmationAudio.toString('base64'),
        },
      };
    }),

  /**
   * Parse text (without audio) and return confirmation audio
   * Useful for text input with audio feedback
   */
  parseWithFeedback: protectedProcedure
    .input(z.object({
      text: z.string().min(1),
      mode: z.enum(['tally', 'immediate']).default('tally'),
      customerId: z.string().optional(),
      tallyId: z.string().optional(),
      jobName: z.string().optional(),
      generateAudio: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Parse the text
      const parsed = await smartTemplates.parseQuickInvoice({
        text: input.text,
        userId,
        autoCreateCustomer: false,
        autoCreateService: false,
      });

      if (!parsed.lineItems || parsed.lineItems.length === 0) {
        const errorText = "Couldn't parse any items from your input.";
        let audioBase64: string | undefined;
        if (input.generateAudio) {
          const errorAudio = await aiRouter.generateSpeech(errorText);
          audioBase64 = errorAudio.toString('base64');
        }

        return {
          parsed: null,
          action: 'error',
          confirmation: {
            text: errorText,
            audioBase64,
          },
        };
      }

      // Determine customer
      let customerId = input.customerId || parsed.customer?.id;
      const customerName = parsed.customer?.name || 'Unknown';

      if (!customerId) {
        const clarifyText = `Parsed ${parsed.lineItems.length} items but need a customer.`;
        let audioBase64: string | undefined;
        if (input.generateAudio) {
          const clarifyAudio = await aiRouter.generateSpeech(clarifyText);
          audioBase64 = clarifyAudio.toString('base64');
        }

        return {
          parsed,
          action: 'needs_customer',
          confirmation: {
            text: clarifyText,
            audioBase64,
          },
        };
      }

      // Execute based on mode (reusing logic from process)
      let resultAction: string;
      let resultData: any;

      if (input.mode === 'tally') {
        let tally = await ctx.prisma.tallyInvoice.findFirst({
          where: { customerId, userId, status: TallyStatus.OPEN },
        });

        if (!tally) {
          tally = await ctx.prisma.tallyInvoice.create({
            data: {
              customerId,
              userId,
              status: TallyStatus.OPEN,
              source: 'text',
              serviceAddress: input.jobName || undefined,
            },
          });
        }

        const currentItemCount = await ctx.prisma.tallyItem.count({
          where: { tallyInvoiceId: tally.id },
        });

        for (let i = 0; i < parsed.lineItems.length; i++) {
          const item = parsed.lineItems[i];
          await ctx.prisma.tallyItem.create({
            data: {
              tallyInvoiceId: tally.id,
              serviceId: item.service?.id || null,
              description: item.service?.name || item.description || 'Unnamed item',
              quantity: item.quantity,
              unit: item.unit,
              rate: item.rate,
              amount: item.amount,
              serviceDate: new Date(parsed.date),
              source: 'text',
              rawInput: input.text,
              order: currentItemCount + i,
            },
          });
        }

        const updatedTally = await ctx.prisma.tallyInvoice.update({
          where: { id: tally.id },
          data: {
            subtotal: { increment: parsed.total },
            itemCount: { increment: parsed.lineItems.length },
          },
          include: { customer: true },
        });

        resultAction = 'added_to_tally';
        resultData = { tally: updatedTally };
      } else {
        const lastInvoice = await ctx.prisma.invoice.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { invoiceNumber: true },
        });
        const lastNumber = lastInvoice
          ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
          : 0;
        const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

        const invoice = await ctx.prisma.invoice.create({
          data: {
            invoiceNumber,
            userId,
            customerId,
            serviceDate: new Date(parsed.date),
            dueDate: new Date(parsed.date), // Due on receipt
            serviceAddress: input.jobName || undefined,
            subtotal: parsed.total,
            taxRate: 0,
            taxAmount: 0,
            discount: 0,
            total: parsed.total,
            notes: `Created via text input`,
            source: 'text',
            lineItems: {
              create: parsed.lineItems.map((item, index) => ({
                serviceId: item.service?.id || null,
                description: item.service?.name || item.description || 'Unnamed item',
                quantity: item.quantity,
                unit: item.unit,
                rate: item.rate,
                amount: item.amount,
                order: index,
              })),
            },
          },
          include: { customer: true, lineItems: true },
        });

        resultAction = 'created_invoice';
        resultData = { invoice };
      }

      // Generate confirmation
      const itemDesc = parsed.lineItems
        .map(i => `${i.quantity} ${i.unit || 'units'} ${i.description}`)
        .join(', ');

      let confirmationText: string;
      if (resultAction === 'added_to_tally') {
        const tally = resultData.tally;
        confirmationText = `Added ${itemDesc} for ${customerName}. Tally total is now $${Number(tally.subtotal).toFixed(2)}.`;
      } else {
        const invoice = resultData.invoice;
        confirmationText = `Created invoice ${invoice.invoiceNumber} for ${customerName}. Total is $${Number(invoice.total).toFixed(2)}.`;
      }

      let audioBase64: string | undefined;
      if (input.generateAudio) {
        const confirmationAudio = await aiRouter.generateSpeech(confirmationText);
        audioBase64 = confirmationAudio.toString('base64');
      }

      return {
        parsed,
        action: resultAction,
        data: resultData,
        confirmation: {
          text: confirmationText,
          audioBase64,
        },
      };
    }),
});
