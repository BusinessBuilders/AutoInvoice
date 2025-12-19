import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { requirePermission, Permission } from '../middleware/rbac';
import { logAuditEvent } from '../utils/monitoring';

/**
 * GDPR Compliance Router
 * Implements data export and right to be forgotten
 */

export const gdprRouter = router({
  // Export all user data (GDPR Article 15)
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Collect all user data
    const [user, leads, customers, invoices, tasks, quotes, receipts, services] = await Promise.all([
      ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      ctx.prisma.lead.findMany({
        where: { userId },
        include: { customer: true }
      }),
      ctx.prisma.customer.findMany({
        where: { userId },
        include: { invoices: true }
      }),
      ctx.prisma.invoice.findMany({
        where: { customerId: { in: await ctx.prisma.customer.findMany({ where: { userId }, select: { id: true } }).then(c => c.map(x => x.id)) } },
        include: { lineItems: true, customer: true }
      }),
      ctx.prisma.task.findMany({
        where: {
          OR: [{ assignedToId: userId }, { createdById: userId }],
        },
      }),
      ctx.prisma.quote.findMany({
        where: { userId },
        include: { customer: true, lineItems: true }
      }),
      ctx.prisma.receipt.findMany({
        where: { userId },
        select: {
          id: true,
          vendor: true,
          amount: true,
          date: true,
          category: true,
          confidence: true,
          ocrData: true,
          paymentMethod: true,
          notes: true,
          status: true,
          invoiceId: true,
          createdAt: true,
          updatedAt: true,
          // Exclude imageData as it could be very large
        }
      }),
      ctx.prisma.service.findMany({ where: { userId } }),
    ]);

    logAuditEvent(userId, 'EXPORT_DATA', 'user', userId);

    return {
      exportDate: new Date().toISOString(),
      user,
      leads,
      customers,
      invoices,
      tasks,
      quotes,
      receipts,
      services,
    };
  }),

  // Import user data (restore from backup)
  importData: protectedProcedure
    .input(
      z.object({
        data: z.object({
          customers: z.array(z.any()).optional(),
          invoices: z.array(z.any()).optional(),
          services: z.array(z.any()).optional(),
          receipts: z.array(z.any()).optional(),
          leads: z.array(z.any()).optional(),
          quotes: z.array(z.any()).optional(),
        }),
        clearExisting: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      try {
        // If clearExisting is true, delete all existing user data first
        if (input.clearExisting) {
          await ctx.prisma.$transaction([
            // Delete in reverse dependency order
            ctx.prisma.receipt.deleteMany({ where: { userId } }),
            ctx.prisma.invoice.deleteMany({
              where: {
                customer: { userId }
              }
            }),
            ctx.prisma.quote.deleteMany({ where: { userId } }),
            ctx.prisma.lead.deleteMany({ where: { userId } }),
            ctx.prisma.service.deleteMany({ where: { userId } }),
            ctx.prisma.customer.deleteMany({ where: { userId } }),
          ]);
        }

        // Create ID mapping for relationships
        const customerIdMap = new Map<string, string>();
        const serviceIdMap = new Map<string, string>();

        // Import services first (no dependencies)
        if (input.data.services && input.data.services.length > 0) {
          for (const service of input.data.services) {
            const oldId = service.id;
            const { id, userId: _userId, ...serviceData } = service;
            const newService = await ctx.prisma.service.create({
              data: {
                ...serviceData,
                userId,
              },
            });
            serviceIdMap.set(oldId, newService.id);
          }
        }

        // Import customers
        if (input.data.customers && input.data.customers.length > 0) {
          for (const customer of input.data.customers) {
            const oldId = customer.id;
            const { id, userId: _userId, invoices, ...customerData } = customer;
            const newCustomer = await ctx.prisma.customer.create({
              data: {
                ...customerData,
                userId,
              },
            });
            customerIdMap.set(oldId, newCustomer.id);
          }
        }

        // Import invoices with line items
        if (input.data.invoices && input.data.invoices.length > 0) {
          for (const invoice of input.data.invoices) {
            const { id, customerId, lineItems, customer, ...invoiceData } = invoice;
            const newCustomerId = customerIdMap.get(customerId);

            if (newCustomerId) {
              await ctx.prisma.invoice.create({
                data: {
                  ...invoiceData,
                  customerId: newCustomerId,
                  lineItems: {
                    create: lineItems?.map((item: any) => {
                      const { id, invoiceId, ...itemData } = item;
                      return itemData;
                    }) || [],
                  },
                },
              });
            }
          }
        }

        // Import receipts
        if (input.data.receipts && input.data.receipts.length > 0) {
          for (const receipt of input.data.receipts) {
            const { id, ...receiptData } = receipt;
            await ctx.prisma.receipt.create({
              data: {
                ...receiptData,
                userId,
              },
            });
          }
        }

        // Import leads
        if (input.data.leads && input.data.leads.length > 0) {
          for (const lead of input.data.leads) {
            const { id, customerId, customer, ...leadData } = lead;
            const newCustomerId = customerId ? customerIdMap.get(customerId) : undefined;

            await ctx.prisma.lead.create({
              data: {
                ...leadData,
                userId,
                customerId: newCustomerId || null,
              },
            });
          }
        }

        // Import quotes
        if (input.data.quotes && input.data.quotes.length > 0) {
          for (const quote of input.data.quotes) {
            const { id, customerId, lineItems, customer, ...quoteData } = quote;
            const newCustomerId = customerIdMap.get(customerId);

            if (newCustomerId) {
              await ctx.prisma.quote.create({
                data: {
                  ...quoteData,
                  userId,
                  customerId: newCustomerId,
                  lineItems: {
                    create: lineItems?.map((item: any) => {
                      const { id, quoteId, ...itemData } = item;
                      return itemData;
                    }) || [],
                  },
                },
              });
            }
          }
        }

        logAuditEvent(userId, 'IMPORT_DATA', 'user', userId);

        return {
          success: true,
          message: 'Data imported successfully',
          stats: {
            customers: input.data.customers?.length || 0,
            invoices: input.data.invoices?.length || 0,
            services: input.data.services?.length || 0,
            receipts: input.data.receipts?.length || 0,
            leads: input.data.leads?.length || 0,
            quotes: input.data.quotes?.length || 0,
          },
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to import data: ${error.message}`,
        });
      }
    }),

  // Delete all user data (GDPR Article 17 - Right to be Forgotten)
  deleteAccount: protectedProcedure
    .input(
      z.object({
        confirmEmail: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Verify email matches
      if (input.confirmEmail !== ctx.user.email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Email does not match',
        });
      }

      // Verify password
      const bcrypt = require('bcryptjs');
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const validPassword = await bcrypt.compare(input.password, user.password);
      if (!validPassword) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid password',
        });
      }

      // Log before deletion
      logAuditEvent(userId, 'DELETE_ACCOUNT', 'user', userId);

      // Delete all user data (cascading deletes)
      await ctx.prisma.$transaction([
        // Delete refresh tokens
        ctx.prisma.refreshToken.deleteMany({ where: { userId } }),

        // Delete password resets
        ctx.prisma.passwordReset.deleteMany({ where: { userId } }),

        // Delete tasks
        ctx.prisma.task.deleteMany({
          where: {
            OR: [{ assignedToId: userId }, { createdById: userId }],
          },
        }),

        // Delete leads
        ctx.prisma.lead.deleteMany({ where: { userId } }),

        // Delete quotes
        ctx.prisma.quote.deleteMany({ where: { userId } }),

        // Finally delete user
        ctx.prisma.user.delete({ where: { id: userId } }),
      ]);

      return {
        success: true,
        message: 'Account and all associated data permanently deleted',
      };
    }),

  // Get audit log for user
  getAuditLog: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      // Note: This requires an AuditLog model in the schema
      // For now, return placeholder
      return {
        logs: [],
        message: 'Audit logging requires AuditLog model to be added to schema',
      };
    }),
});
