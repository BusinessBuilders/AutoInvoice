import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../utils/db';
import { aiRouter } from '../services/ai';
import logger from '../utils/logger';
import { LeadStatus, Priority } from '@prisma/client';

export const leadRouter = router({
  /**
   * Create new lead (manual entry or from message)
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        phone: z.string().min(10),
        email: z.string().email().optional(),
        message: z.string().optional(),
        projectType: z.string().optional(),
        estimatedArea: z.number().optional(),
        source: z.string().default('manual'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lead = await prisma.lead.create({
        data: {
          ...input,
          userId: ctx.user.id,
          status: 'NEW',
        },
      });

      logger.info('Lead created', { leadId: lead.id, name: lead.name });

      return lead;
    }),

  /**
   * List leads with filters
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST', 'DEAD']).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {
        userId: ctx.user.id,
      };

      if (input.status) where.status = input.status;
      if (input.priority) where.priority = input.priority;

      const leads = await prisma.lead.findMany({
        where,
        orderBy: [
          { priority: 'desc' }, // URGENT first
          { createdAt: 'desc' }, // Newest first
        ],
        take: input.limit,
        skip: input.offset,
        include: {
          reminders: {
            where: { status: 'PENDING' },
            orderBy: { remindAt: 'asc' },
            take: 3,
          },
          quotes: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          convertedToCustomer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return leads;
    }),

  /**
   * Get lead by ID with full details
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const lead = await prisma.lead.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        include: {
          reminders: {
            orderBy: { remindAt: 'asc' },
          },
          followUps: {
            orderBy: { scheduledFor: 'asc' },
          },
          quotes: {
            orderBy: { createdAt: 'desc' },
            include: {
              lineItems: true,
            },
          },
          notes: {
            orderBy: { createdAt: 'desc' },
          },
          convertedToCustomer: true,
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      return lead;
    }),

  /**
   * Update lead status
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST', 'DEAD']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lead = await prisma.lead.updateMany({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        data: {
          status: input.status,
          lastContactedAt: input.status === 'CONTACTED' ? new Date() : undefined,
          convertedAt: input.status === 'WON' ? new Date() : undefined,
        },
      });

      return { success: true };
    }),

  /**
   * Set reminder for lead
   */
  setReminder: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        title: z.string(),
        remindAt: z.date(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const reminder = await prisma.reminder.create({
        data: {
          leadId: input.leadId,
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          remindAt: input.remindAt,
          notifyVia: ['push', 'in-app'],
        },
      });

      logger.info('Reminder set', {
        reminderId: reminder.id,
        leadId: input.leadId,
        remindAt: input.remindAt
      });

      return reminder;
    }),

  /**
   * Generate AI follow-up message
   */
  generateMessage: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        context: z.string().optional(), // "initial_contact", "follow_up", "quote_sent", etc.
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lead = await prisma.lead.findFirst({
        where: {
          id: input.leadId,
          userId: ctx.user.id,
        },
        include: {
          quotes: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      // Build context for AI
      const context = input.context || 'follow_up';
      let prompt = '';

      if (context === 'initial_contact') {
        prompt = `Write a friendly, professional SMS message for initial contact with a potential landscaping customer.

Details:
- Customer name: ${lead.name}
- Project: ${lead.projectType || 'landscaping services'}
- Area: ${lead.estimatedArea ? `${lead.estimatedArea} sqft` : 'not specified'}
- Original message: "${lead.message || 'No message'}"

Write a brief (2-3 sentences) SMS introducing yourself and offering to provide a quote.
Be professional but friendly. Don't be pushy.`;
      } else if (context === 'quote_sent' && lead.quotes.length > 0) {
        const quote = lead.quotes[0];
        prompt = `Write a follow-up SMS after sending a quote to a landscaping customer.

Details:
- Customer name: ${lead.name}
- Quote amount: $${quote.total}
- Project: ${quote.projectType}

Write a brief (2-3 sentences) SMS checking if they received the quote and if they have questions.
Be friendly and helpful. Make it easy for them to respond.`;
      } else {
        prompt = `Write a friendly follow-up SMS for a landscaping lead who hasn't responded yet.

Details:
- Customer name: ${lead.name}
- Project: ${lead.projectType || 'landscaping services'}
- Days since contact: ${Math.floor((Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24))}

Write a brief (2-3 sentences) SMS checking if they're still interested.
Be friendly but not pushy. Give them an easy out if they're not interested.`;
      }

      // Use AI to generate message
      const completion = await aiRouter.parseInvoice(prompt);

      // Extract the message from AI response
      // For now, we'll use a simple approach - in production you'd format this better
      const message = typeof completion === 'string' ? completion : JSON.stringify(completion);

      return {
        message: message.substring(0, 160), // SMS limit
        leadId: input.leadId,
        context,
      };
    }),

  /**
   * Get message app deep link
   * Returns URL to open native messaging app with pre-filled message
   */
  getMessageLink: protectedProcedure
    .input(
      z.object({
        phone: z.string(),
        message: z.string(),
      })
    )
    .query(({ input }) => {
      // iOS: sms:PHONE&body=MESSAGE
      // Android: sms:PHONE?body=MESSAGE

      // URL encode the message
      const encodedMessage = encodeURIComponent(input.message);
      const cleanPhone = input.phone.replace(/\D/g, ''); // Remove non-digits

      return {
        ios: `sms:${cleanPhone}&body=${encodedMessage}`,
        android: `sms:${cleanPhone}?body=${encodedMessage}`,
        // For web, we'll just return the formatted data
        phone: cleanPhone,
        message: input.message,
      };
    }),

  /**
   * Add note to lead
   */
  addNote: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        content: z.string(),
        type: z.enum(['note', 'call', 'meeting', 'email']).default('note'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const note = await prisma.leadNote.create({
        data: {
          leadId: input.leadId,
          userId: ctx.user.id,
          content: input.content,
          type: input.type,
        },
      });

      return note;
    }),

  /**
   * Convert lead to customer
   */
  convertToCustomer: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        additionalInfo: z.object({
          email: z.string().email().optional(),
          address: z.string().optional(),
          notes: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lead = await prisma.lead.findFirst({
        where: {
          id: input.leadId,
          userId: ctx.user.id,
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      if (lead.convertedToCustomerId) {
        throw new Error('Lead already converted to customer');
      }

      // Create customer
      const customer = await prisma.customer.create({
        data: {
          userId: ctx.user.id,
          name: lead.name,
          phone: lead.phone,
          email: input.additionalInfo?.email || lead.email,
          notes: input.additionalInfo?.notes,
          tags: ['from-lead'],
        },
      });

      // Update lead
      await prisma.lead.update({
        where: { id: input.leadId },
        data: {
          convertedToCustomerId: customer.id,
          convertedAt: new Date(),
          status: 'WON',
        },
      });

      logger.info('Lead converted to customer', {
        leadId: input.leadId,
        customerId: customer.id,
      });

      return customer;
    }),

  /**
   * Get lead stats
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, newLeads, contacted, quoted, won, lost] = await Promise.all([
      prisma.lead.count({ where: { userId: ctx.user.id } }),
      prisma.lead.count({ where: { userId: ctx.user.id, status: 'NEW' } }),
      prisma.lead.count({ where: { userId: ctx.user.id, status: 'CONTACTED' } }),
      prisma.lead.count({ where: { userId: ctx.user.id, status: 'QUOTED' } }),
      prisma.lead.count({ where: { userId: ctx.user.id, status: 'WON' } }),
      prisma.lead.count({ where: { userId: ctx.user.id, status: 'LOST' } }),
    ]);

    const conversionRate = total > 0 ? (won / total) * 100 : 0;

    return {
      total,
      newLeads,
      contacted,
      quoted,
      won,
      lost,
      conversionRate: Math.round(conversionRate * 10) / 10,
    };
  }),

  /**
   * Get pending reminders
   */
  getPendingReminders: protectedProcedure.query(async ({ ctx }) => {
    const reminders = await prisma.reminder.findMany({
      where: {
        userId: ctx.user.id,
        status: 'PENDING',
        remindAt: {
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next 24 hours
        },
      },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            projectType: true,
            status: true,
          },
        },
      },
      orderBy: {
        remindAt: 'asc',
      },
    });

    return reminders;
  }),

  /**
   * Complete reminder
   */
  completeReminder: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await prisma.reminder.updateMany({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      return { success: true };
    }),

  /**
   * Snooze reminder
   */
  snoozeReminder: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        snoozeUntil: z.date(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await prisma.reminder.updateMany({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        data: {
          status: 'SNOOZED',
          snoozedUntil: input.snoozeUntil,
          remindAt: input.snoozeUntil,
        },
      });

      return { success: true };
    }),

  /** Lead → Won → Subscription (spec §3.7). Reuses or creates the customer,
   * creates the subscription, marks the lead WON. Eve's intake creates leads
   * via lead.create / the create_lead MCP tool; this closes the loop. */
  convertToSubscription: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        companyId: z.string(),
        name: z.string().min(1),
        interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).default('MONTHLY'),
        amount: z.number().positive(),
        startDate: z.coerce.date().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const lead = await prisma.lead.findFirst({
        where: { id: input.leadId, userId: ctx.user.id },
      });
      if (!lead) throw new Error('Lead not found');
      const company = await prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });
      if (!company) throw new Error('Company not found');

      let customerId = lead.convertedToCustomerId;
      if (!customerId) {
        const customer = await prisma.customer.create({
          data: {
            userId: ctx.user.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            primaryCompanyId: input.companyId,
            tags: ['from-lead', 'subscription'],
          },
        });
        customerId = customer.id;
      }

      const { advance } = await import('../services/subscriptions');
      const startDate = input.startDate ?? new Date();
      const subscription = await prisma.subscription.create({
        data: {
          userId: ctx.user.id,
          companyId: input.companyId,
          customerId,
          leadId: lead.id,
          name: input.name,
          interval: input.interval,
          amount: input.amount,
          startDate,
          currentPeriodEnd: advance(startDate, input.interval),
          notes: input.notes,
        },
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.WON,
          convertedToCustomerId: customerId,
          convertedAt: new Date(),
          companyId: lead.companyId ?? input.companyId,
        },
      });

      await prisma.activity.create({
        data: {
          userId: ctx.user.id,
          companyId: input.companyId,
          customerId,
          leadId: lead.id,
          type: 'SYSTEM',
          body: `Lead won — subscription "${input.name}" started ($${input.amount}/${input.interval.toLowerCase()})`,
          source: 'system',
        },
      });

      return { subscription, customerId };
    }),
});
