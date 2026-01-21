/**
 * Categorization Rules Router
 *
 * CRUD operations for bank transaction categorization rules
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { MatchType } from '@prisma/client';
import { testRuleMatch, suggestRule } from '../services/accounting/rule-matching';

const createRuleSchema = z.object({
  companyId: z.string(),
  name: z.string().min(1),
  matchType: z.nativeEnum(MatchType),
  matchValue: z.string().min(1),
  taxAccountId: z.string(),
  vendorId: z.string().optional(), // Optional: also assign vendor when rule matches
  priority: z.number().int().min(0).max(100).default(50),
  enabled: z.boolean().default(true),
});

const updateRuleSchema = createRuleSchema.partial().extend({
  id: z.string(),
});

export const categorizationRulesRouter = router({
  // List all rules for a company
  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        enabled: z.boolean().optional(),
        taxAccountId: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, enabled, taxAccountId, search } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const rules = await ctx.prisma.categorizationRule.findMany({
        where: {
          companyId,
          ...(enabled !== undefined && { enabled }),
          ...(taxAccountId && { taxAccountId }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { matchValue: { contains: search, mode: 'insensitive' as const } },
            ],
          }),
        },
        include: {
          taxAccount: {
            select: {
              id: true,
              code: true,
              name: true,
              taxTreatment: true,
            },
          },
          vendor: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      });

      return rules;
    }),

  // Get single rule
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const rule = await ctx.prisma.categorizationRule.findUnique({
        where: { id: input.id },
        include: {
          company: true,
          taxAccount: true,
          vendor: true,
        },
      });

      if (!rule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
      }

      if (rule.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      return rule;
    }),

  // Create rule
  create: protectedProcedure
    .input(createRuleSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // Verify tax account exists and belongs to same company
      const taxAccount = await ctx.prisma.taxAccount.findFirst({
        where: { id: input.taxAccountId, companyId: input.companyId },
      });

      if (!taxAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tax account not found' });
      }

      const rule = await ctx.prisma.categorizationRule.create({
        data: {
          ...input,
          autoCreated: false,
        },
        include: {
          taxAccount: true,
          vendor: true,
        },
      });

      return rule;
    }),

  // Update rule
  update: protectedProcedure
    .input(updateRuleSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.prisma.categorizationRule.findUnique({
        where: { id },
        include: { company: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const updated = await ctx.prisma.categorizationRule.update({
        where: { id },
        data,
        include: {
          taxAccount: true,
          vendor: true,
        },
      });

      return updated;
    }),

  // Delete rule
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.categorizationRule.findUnique({
        where: { id: input.id },
        include: { company: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      await ctx.prisma.categorizationRule.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Toggle rule enabled/disabled
  toggle: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.categorizationRule.findUnique({
        where: { id: input.id },
        include: { company: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      const updated = await ctx.prisma.categorizationRule.update({
        where: { id: input.id },
        data: { enabled: !existing.enabled },
      });

      return updated;
    }),

  // Test a rule pattern against a description
  test: protectedProcedure
    .input(
      z.object({
        description: z.string(),
        matchType: z.nativeEnum(MatchType),
        matchValue: z.string(),
      })
    )
    .query(({ input }) => {
      return testRuleMatch(input.description, input.matchType, input.matchValue);
    }),

  // Suggest a rule from a manual categorization
  suggest: protectedProcedure
    .input(
      z.object({
        description: z.string(),
        taxAccountId: z.string(),
      })
    )
    .query(({ input }) => {
      return suggestRule(input.description, input.taxAccountId);
    }),

  // Apply vendor to all transactions that matched this rule
  // Use this after adding a vendor to a rule to retroactively update past transactions
  applyVendorToMatched: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.prisma.categorizationRule.findUnique({
        where: { id: input.id },
        include: { company: true },
      });

      if (!rule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
      }

      if (rule.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      if (!rule.vendorId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Rule has no vendor assigned. Add a vendor first.',
        });
      }

      // Update all transactions that were matched by this rule
      const result = await ctx.prisma.bankTransaction.updateMany({
        where: {
          matchedRuleId: rule.id,
          vendorId: null, // Only update transactions that don't already have a vendor
        },
        data: {
          vendorId: rule.vendorId,
        },
      });

      return {
        updated: result.count,
        message: `Applied vendor to ${result.count} transactions`,
      };
    }),

  // Get rule statistics
  stats: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const [total, enabled, autoCreated, topRules] = await Promise.all([
        ctx.prisma.categorizationRule.count({ where: { companyId: input.companyId } }),
        ctx.prisma.categorizationRule.count({ where: { companyId: input.companyId, enabled: true } }),
        ctx.prisma.categorizationRule.count({ where: { companyId: input.companyId, autoCreated: true } }),
        ctx.prisma.categorizationRule.findMany({
          where: { companyId: input.companyId },
          orderBy: { timesMatched: 'desc' },
          take: 10,
          include: { taxAccount: { select: { name: true } } },
        }),
      ]);

      return {
        total,
        enabled,
        disabled: total - enabled,
        autoCreated,
        manualCreated: total - autoCreated,
        topRules: topRules.map((r) => ({
          id: r.id,
          name: r.name,
          matchValue: r.matchValue,
          timesMatched: r.timesMatched,
          accountName: r.taxAccount.name,
        })),
      };
    }),
});
