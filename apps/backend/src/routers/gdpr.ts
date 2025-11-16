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
    const [user, leads, customers, invoices, tasks, quotes] = await Promise.all([
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
      ctx.prisma.lead.findMany({ where: { userId } }),
      ctx.prisma.customer.findMany(),
      ctx.prisma.invoice.findMany(),
      ctx.prisma.task.findMany({
        where: {
          OR: [{ assignedToId: userId }, { createdById: userId }],
        },
      }),
      ctx.prisma.quote.findMany({ where: { userId } }),
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
    };
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
