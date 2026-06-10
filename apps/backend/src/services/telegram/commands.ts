import { Context } from 'telegraf';
import { prisma } from '../../utils/db';
import { aiRouter } from '../ai';
import { queueHelpers } from '../queue';
import { InvoiceStatus } from '@prisma/client';
import logger from '../../utils/logger';

/**
 * Telegram Bot Command Handlers
 * Production-ready implementation with full conversation flow
 */

// Store conversation state
const conversationState = new Map<number, {
  step: 'awaiting_confirmation' | 'awaiting_customer' | 'awaiting_details';
  data?: any;
}>();

/**
 * /start - Welcome message and bot introduction
 */
export async function handleStart(ctx: Context) {
  const username = ctx.from?.first_name || 'there';

  await ctx.reply(
    `👋 Hey ${username}! Welcome to AutoInvoice!\n\n` +
    `I'm your AI-powered invoicing assistant. I can help you:\n\n` +
    `📝 Create invoices from natural language\n` +
    `🎤 Process voice messages\n` +
    `👥 Manage customers\n` +
    `📊 Track invoice status\n` +
    `💰 Monitor payments\n\n` +
    `Just tell me what you did and who for, like:\n` +
    `"Invoice John Smith for lawn mowing today, $50"\n\n` +
    `Commands:\n` +
    `/help - Show all commands\n` +
    `/new - Create new invoice\n` +
    `/customers - List all customers\n` +
    `/invoices - List recent invoices\n` +
    `/stats - Show statistics\n` +
    `/search <name> - Find a customer\n\n` +
    `Let's get started! 🚀`
  );
}

/**
 * /help - Comprehensive help message
 */
export async function handleHelp(ctx: Context) {
  await ctx.reply(
    `📚 AutoInvoice Bot Commands\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📝 INVOICE CREATION\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `/new - Start new invoice wizard\n` +
    `Just describe the job in plain English!\n\n` +
    `Examples:\n` +
    `• "Invoice Mike for pool cleaning, $75"\n` +
    `• "Bill Sarah $150 for tree trimming yesterday"\n` +
    `• "Create invoice: John, mowed lawn + edging, $60"\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 CUSTOMER MANAGEMENT\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `/customers - List all customers\n` +
    `/search <name> - Search for customer\n` +
    `/customer <id> - View customer details\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 INVOICES & REPORTING\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `/invoices - Recent invoices (last 10)\n` +
    `/invoice <number> - View invoice details\n` +
    `/pending - Show unpaid invoices\n` +
    `/stats - Business statistics\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚙️ OTHER\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `/cancel - Cancel current operation\n` +
    `/settings - Bot settings\n\n` +
    `💡 Tip: You can also send voice messages!`
  );
}

/**
 * /new - Start invoice creation wizard
 */
export async function handleNew(ctx: Context) {
  await ctx.reply(
    `📝 New Invoice Creation\n\n` +
    `Tell me about the job in natural language.\n\n` +
    `Include:\n` +
    `• Customer name\n` +
    `• Service(s) performed\n` +
    `• Amount\n` +
    `• Date (optional)\n\n` +
    `Example:\n` +
    `"John Smith, mowed lawn and trimmed edges today, $75 total"\n\n` +
    `Or type /cancel to abort.`
  );

  conversationState.set(ctx.from!.id, {
    step: 'awaiting_details'
  });
}

/**
 * /customers - List all customers
 */
export async function handleCustomers(ctx: Context) {
  try {
    const customers = await prisma.customer.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { invoices: true }
        }
      }
    });

    if (customers.length === 0) {
      await ctx.reply(`No customers found. Create your first invoice to add a customer!`);
      return;
    }

    let message = `👥 Your Customers (${customers.length})\n\n`;

    for (const customer of customers) {
      const nicknames = customer.nickname.length > 0
        ? `\n   aka: ${customer.nickname.join(', ')}`
        : '';

      message += `━━━━━━━━━━━━━━━━\n`;
      message += `📋 ${customer.name}${nicknames}\n`;
      message += `📧 ${customer.email || 'No email'}\n`;
      message += `📞 ${customer.phone || 'No phone'}\n`;
      message += `📝 Invoices: ${customer._count.invoices}\n`;
    }

    message += `\n💡 Use /search <name> to find a specific customer`;

    await ctx.reply(message);
  } catch (error) {
    logger.error('Telegram /customers error:', error);
    await ctx.reply(`❌ Failed to fetch customers. Please try again.`);
  }
}

/**
 * /invoices - List recent invoices
 */
export async function handleInvoices(ctx: Context) {
  try {
    const invoices = await prisma.invoice.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true
      }
    });

    if (invoices.length === 0) {
      await ctx.reply(`No invoices yet. Create one with /new or just describe a job!`);
      return;
    }

    let message = `📄 Recent Invoices\n\n`;

    for (const invoice of invoices) {
      const statusEmoji = {
        DRAFT: '📝',
        SENT: '📤',
        VIEWED: '👀',
        PAID: '✅',
        OVERDUE: '⚠️',
        CANCELLED: '❌'
      }[invoice.status];

      message += `━━━━━━━━━━━━━━━━\n`;
      message += `${statusEmoji} ${invoice.invoiceNumber}\n`;
      message += `👤 ${invoice.customer.name}\n`;
      message += `💰 $${invoice.total.toFixed(2)}\n`;
      message += `📅 ${invoice.serviceDate.toLocaleDateString()}\n`;
      message += `Status: ${invoice.status}\n`;
    }

    message += `\n💡 Use /invoice <number> for details`;

    await ctx.reply(message);
  } catch (error) {
    logger.error('Telegram /invoices error:', error);
    await ctx.reply(`❌ Failed to fetch invoices. Please try again.`);
  }
}

/**
 * /stats - Show business statistics
 */
export async function handleStats(ctx: Context) {
  try {
    const [
      totalInvoices,
      totalCustomers,
      draftInvoices,
      sentInvoices,
      paidInvoices,
      overdueInvoices,
      totalRevenue,
      pendingRevenue
    ] = await Promise.all([
      prisma.invoice.count(),
      prisma.customer.count(),
      prisma.invoice.count({ where: { status: InvoiceStatus.DRAFT } }),
      prisma.invoice.count({ where: { status: InvoiceStatus.SENT } }),
      prisma.invoice.count({ where: { status: InvoiceStatus.PAID } }),
      prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
      prisma.invoice.aggregate({
        where: { status: InvoiceStatus.PAID },
        _sum: { total: true }
      }),
      prisma.invoice.aggregate({
        where: {
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] }
        },
        _sum: { total: true }
      })
    ]);

    const revenue = totalRevenue._sum.total || 0;
    const pending = pendingRevenue._sum.total || 0;

    await ctx.reply(
      `📊 Business Statistics\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💼 OVERVIEW\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Total Invoices: ${totalInvoices}\n` +
      `Total Customers: ${totalCustomers}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 INVOICE STATUS\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📝 Draft: ${draftInvoices}\n` +
      `📤 Sent: ${sentInvoices}\n` +
      `✅ Paid: ${paidInvoices}\n` +
      `⚠️  Overdue: ${overdueInvoices}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 REVENUE\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Total Collected: $${revenue.toFixed(2)}\n` +
      `Pending Payment: $${pending.toFixed(2)}\n` +
      `Total Outstanding: $${(Number(revenue) + Number(pending)).toFixed(2)}`
    );
  } catch (error) {
    logger.error('Telegram /stats error:', error);
    await ctx.reply(`❌ Failed to fetch statistics. Please try again.`);
  }
}

/**
 * /pending - Show unpaid invoices
 */
export async function handlePending(ctx: Context) {
  try {
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] }
      },
      orderBy: { dueDate: 'asc' },
      include: {
        customer: true
      }
    });

    if (unpaidInvoices.length === 0) {
      await ctx.reply(`🎉 No pending invoices! All caught up.`);
      return;
    }

    let message = `💸 Pending Payments (${unpaidInvoices.length})\n\n`;

    for (const invoice of unpaidInvoices) {
      const isOverdue = invoice.status === InvoiceStatus.OVERDUE;
      const daysUntilDue = Math.ceil(
        (invoice.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      message += `━━━━━━━━━━━━━━━━\n`;
      message += `${isOverdue ? '⚠️' : '📤'} ${invoice.invoiceNumber}\n`;
      message += `👤 ${invoice.customer.name}\n`;
      message += `💰 $${invoice.total.toFixed(2)}\n`;
      message += `📅 Due: ${invoice.dueDate.toLocaleDateString()}`;

      if (isOverdue) {
        message += ` (${Math.abs(daysUntilDue)} days overdue)\n`;
      } else {
        message += ` (${daysUntilDue} days)\n`;
      }
    }

    message += `\n💡 Total pending: $${unpaidInvoices.reduce((sum, inv) => sum + Number(inv.total), 0).toFixed(2)}`;

    await ctx.reply(message);
  } catch (error) {
    logger.error('Telegram /pending error:', error);
    await ctx.reply(`❌ Failed to fetch pending invoices. Please try again.`);
  }
}

/**
 * /search - Search for customers
 */
export async function handleSearch(ctx: Context, query: string) {
  if (!query || query.trim().length === 0) {
    await ctx.reply(`Please provide a search term.\n\nExample: /search John`);
    return;
  }

  try {
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { nickname: { has: query } },
          { email: { contains: query, mode: 'insensitive' } },
          { company: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: 5,
      include: {
        _count: {
          select: { invoices: true }
        }
      }
    });

    if (customers.length === 0) {
      await ctx.reply(`No customers found matching "${query}"`);
      return;
    }

    let message = `🔍 Search Results for "${query}"\n\n`;

    for (const customer of customers) {
      message += `━━━━━━━━━━━━━━━━\n`;
      message += `📋 ${customer.name}\n`;
      if (customer.email) message += `📧 ${customer.email}\n`;
      if (customer.phone) message += `📞 ${customer.phone}\n`;
      if (customer.company) message += `🏢 ${customer.company}\n`;
      message += `📝 ${customer._count.invoices} invoices\n`;
    }

    await ctx.reply(message);
  } catch (error) {
    logger.error('Telegram /search error:', error);
    await ctx.reply(`❌ Search failed. Please try again.`);
  }
}

/**
 * /cancel - Cancel current operation
 */
export async function handleCancel(ctx: Context) {
  const userId = ctx.from!.id;

  if (conversationState.has(userId)) {
    conversationState.delete(userId);
    await ctx.reply(`✅ Operation cancelled.`);
  } else {
    await ctx.reply(`No active operation to cancel.`);
  }
}

/**
 * Handle text messages (invoice creation from natural language)
 */
export async function handleTextMessage(ctx: Context) {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const userId = ctx.from!.id;

  if (!text || text.startsWith('/')) {
    return; // Skip commands
  }

  try {
    // Show typing indicator
    await ctx.sendChatAction('typing');

    // Check if in conversation state
    const state = conversationState.get(userId);

    if (state?.step === 'awaiting_details') {
      // Parse invoice from natural language
      const invoiceData = await aiRouter.parseInvoice(text);

      conversationState.set(userId, {
        step: 'awaiting_confirmation',
        data: invoiceData
      });

      // Show parsed data for confirmation
      const servicesText = invoiceData.services
        .map((s, i) => `${i + 1}. ${s.description} - $${s.amount.toFixed(2)}`)
        .join('\n');

      const total = invoiceData.services.reduce((sum, s) => sum + s.amount, 0);

      await ctx.reply(
        `✅ Invoice Parsed!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Customer: ${invoiceData.customerName}\n` +
        `📅 Service Date: ${invoiceData.serviceDate}\n` +
        `🎯 Confidence: ${(invoiceData.confidence * 100).toFixed(1)}%\n\n` +
        `📋 Services:\n${servicesText}\n\n` +
        `💰 Total: $${total.toFixed(2)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Reply:\n` +
        `"confirm" to create invoice\n` +
        `"edit" to make changes\n` +
        `"cancel" to abort`,
        { reply_markup: {
          keyboard: [
            [{ text: '✅ Confirm' }, { text: '✏️ Edit' }],
            [{ text: '❌ Cancel' }]
          ],
          one_time_keyboard: true,
          resize_keyboard: true
        }}
      );

      return;
    }

    if (state?.step === 'awaiting_confirmation') {
      const response = text.toLowerCase();

      if (response.includes('confirm') || response === '✅ confirm') {
        // Create the invoice
        await createInvoiceFromData(ctx, state.data);
        conversationState.delete(userId);
        return;
      }

      if (response.includes('cancel') || response === '❌ cancel') {
        conversationState.delete(userId);
        await ctx.reply(`❌ Invoice creation cancelled.`);
        return;
      }

      if (response.includes('edit') || response === '✏️ edit') {
        conversationState.set(userId, { step: 'awaiting_details' });
        await ctx.reply(`Please provide the updated invoice details:`);
        return;
      }
    }

    // Direct invoice creation (no wizard)
    await ctx.reply(`🤔 Processing your request...`);
    const invoiceData = await aiRouter.parseInvoice(text);

    // Auto-create if confidence is high
    if (invoiceData.confidence >= 0.8) {
      await createInvoiceFromData(ctx, invoiceData);
    } else {
      // Ask for confirmation if confidence is low
      conversationState.set(userId, {
        step: 'awaiting_confirmation',
        data: invoiceData
      });

      const servicesText = invoiceData.services
        .map((s, i) => `${i + 1}. ${s.description} - $${s.amount.toFixed(2)}`)
        .join('\n');

      await ctx.reply(
        `⚠️ Low confidence (${(invoiceData.confidence * 100).toFixed(1)}%)\n\n` +
        `I understood:\n` +
        `👤 ${invoiceData.customerName}\n` +
        `📅 ${invoiceData.serviceDate}\n\n` +
        `${servicesText}\n\n` +
        `Is this correct? (yes/no)`
      );
    }
  } catch (error: any) {
    logger.error('Telegram text message error:', error);
    await ctx.reply(
      `❌ Sorry, I couldn't process that.\n\n` +
      `${error.message}\n\n` +
      `Please try rephrasing or use /help for examples.`
    );
  }
}

/**
 * Resolve the owner user ID for Telegram-created records.
 * Telegram operates outside the tRPC auth context, so we associate all
 * Telegram-created records with the account owner.
 */
async function getOwnerUserId(): Promise<string> {
  const owner = await prisma.user.findFirstOrThrow({
    where: { role: 'OWNER', active: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return owner.id;
}

/**
 * Create invoice from parsed data
 */
async function createInvoiceFromData(ctx: Context, invoiceData: any) {
  try {
    const ownerUserId = await getOwnerUserId();

    // Find or create customer
    let customer = await prisma.customer.findFirst({
      where: {
        userId: ownerUserId,
        OR: [
          { name: { equals: invoiceData.customerName, mode: 'insensitive' } },
          { nickname: { has: invoiceData.customerName } }
        ]
      }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          userId: ownerUserId,
          name: invoiceData.customerName,
          nickname: [invoiceData.customerName],
          tags: ['telegram']
        }
      });
    }

    // Generate invoice number
    const lastInvoice = await prisma.invoice.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true }
    });

    const lastNumber = lastInvoice
      ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
      : 0;
    const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

    // Calculate totals
    const subtotal = invoiceData.services.reduce((sum: number, s: any) => sum + s.amount, 0);

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        userId: ownerUserId,
        customerId: customer.id,
        invoiceNumber,
        serviceDate: new Date(invoiceData.serviceDate),
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        subtotal,
        total: subtotal,
        status: InvoiceStatus.DRAFT,
        source: 'telegram',
        sourceMessageId: ctx.message?.message_id?.toString(),
        notes: invoiceData.notes,
        lineItems: {
          create: invoiceData.services.map((s: any, i: number) => ({
            description: s.description,
            quantity: s.quantity,
            rate: s.rate,
            amount: s.amount,
            order: i
          }))
        }
      },
      include: {
        customer: true,
        lineItems: true
      }
    });

    // Queue PDF generation
    await queueHelpers.generatePdf(invoice.id);

    await ctx.reply(
      `✅ Invoice Created!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 Invoice #: ${invoice.invoiceNumber}\n` +
      `👤 Customer: ${customer.name}\n` +
      `📅 Date: ${invoice.serviceDate.toLocaleDateString()}\n` +
      `💰 Total: $${invoice.total.toFixed(2)}\n` +
      `📝 Status: ${invoice.status}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📄 PDF is being generated...\n\n` +
      `What's next?\n` +
      `• Send to customer: /send ${invoice.invoiceNumber}\n` +
      `• View details: /invoice ${invoice.invoiceNumber}\n` +
      `• Create another: /new`
    );

    logger.info(`Invoice created via Telegram: ${invoice.invoiceNumber}`, {
      customerId: customer.id,
      telegramUserId: ctx.from?.id
    });
  } catch (error) {
    logger.error('Invoice creation error:', error);
    throw error;
  }
}

export { conversationState };
