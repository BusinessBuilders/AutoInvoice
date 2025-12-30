import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { AccountType, BalanceType } from '@prisma/client';
import { TRPCError } from '@trpc/server';

const createAccountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  accountType: z.nativeEnum(AccountType),
  balanceType: z.nativeEnum(BalanceType),
  parentId: z.string().optional(),
  active: z.boolean().default(true),
  allowManualEntries: z.boolean().default(true),
  taxEnabled: z.boolean().default(false),
  taxRate: z.number().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const updateAccountSchema = createAccountSchema.partial().extend({
  id: z.string(),
});

export const accountsRouter = router({
  // List all accounts
  list: protectedProcedure
    .input(
      z.object({
        accountType: z.nativeEnum(AccountType).optional(),
        active: z.boolean().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { accountType, active, search } = input;

      const accounts = await ctx.prisma.account.findMany({
        where: {
          userId: ctx.user.id,
          ...(accountType && { accountType }),
          ...(active !== undefined && { active }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }),
        },
        include: {
          parent: true,
          children: true,
          _count: {
            select: {
              journalLines: true,
            },
          },
        },
        orderBy: [
          { code: 'asc' },
        ],
      });

      return accounts;
    }),

  // Get account by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.account.findUnique({
        where: { id: input.id },
        include: {
          parent: true,
          children: true,
          journalLines: {
            include: {
              journalEntry: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 20,
          },
          _count: {
            select: {
              journalLines: true,
            },
          },
        },
      });

      if (!account) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Account not found',
        });
      }

      // Verify user owns the account
      if (account.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied to this account',
        });
      }

      return account;
    }),

  // Create account
  create: protectedProcedure
    .input(createAccountSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if code already exists for this user
      const existing = await ctx.prisma.account.findUnique({
        where: {
          userId_code: {
            userId: ctx.user.id,
            code: input.code,
          }
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Account with code ${input.code} already exists`,
        });
      }

      // If parent specified, verify it exists and calculate level
      let level = 0;
      if (input.parentId) {
        const parent = await ctx.prisma.account.findUnique({
          where: { id: input.parentId },
        });

        if (!parent) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Parent account not found',
          });
        }

        level = parent.level + 1;
      }

      return ctx.prisma.account.create({
        data: {
          ...input,
          userId: ctx.user.id,
          level,
        },
        include: {
          parent: true,
          children: true,
        },
      });
    }),

  // Update account
  update: protectedProcedure
    .input(updateAccountSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Check if account exists
      const account = await ctx.prisma.account.findUnique({
        where: { id },
      });

      if (!account) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Account not found',
        });
      }

      // Verify user owns the account
      if (account.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied to this account',
        });
      }

      // Prevent updating system accounts
      if (account.systemAccount) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot update system-managed accounts',
        });
      }

      // If code is being changed, check uniqueness for this user
      if (data.code && data.code !== account.code) {
        const existing = await ctx.prisma.account.findUnique({
          where: {
            userId_code: {
              userId: ctx.user.id,
              code: data.code,
            }
          },
        });

        if (existing) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Account with code ${data.code} already exists`,
          });
        }
      }

      // If parent is being changed, update level
      const updates: Record<string, any> = { ...data };
      if (data.parentId !== undefined && data.parentId !== account.parentId) {
        if (data.parentId) {
          const parent = await ctx.prisma.account.findUnique({
            where: { id: data.parentId },
          });

          if (!parent) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Parent account not found',
            });
          }

          // Prevent circular reference
          if (parent.parentId === id) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot set parent to a child account',
            });
          }

          updates.level = parent.level + 1;
        } else {
          updates.level = 0;
        }
      }

      return ctx.prisma.account.update({
        where: { id },
        data: updates as any,
        include: {
          parent: true,
          children: true,
        },
      });
    }),

  // Soft delete account (set inactive)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.prisma.account.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              journalLines: true,
              children: true,
            },
          },
        },
      });

      if (!account) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Account not found',
        });
      }

      // Prevent deleting system accounts
      if (account.systemAccount) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot delete system-managed accounts',
        });
      }

      // Prevent deleting accounts with children
      if (account._count.children > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete account with child accounts. Delete or reassign children first.',
        });
      }

      // Soft delete by setting inactive
      return ctx.prisma.account.update({
        where: { id: input.id },
        data: { active: false },
      });
    }),

  // Get current balance for account
  getBalance: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        asOfDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.account.findUnique({
        where: { id: input.id },
        include: {
          journalLines: {
            where: input.asOfDate
              ? {
                  journalEntry: {
                    entryDate: {
                      lte: input.asOfDate,
                    },
                    status: 'POSTED',
                  },
                }
              : {
                  journalEntry: {
                    status: 'POSTED',
                  },
                },
          },
        },
      });

      if (!account) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Account not found',
        });
      }

      // Calculate balance based on debits and credits
      let balance = 0;
      for (const line of account.journalLines) {
        const debit = Number(line.debit);
        const credit = Number(line.credit);

        if (account.balanceType === 'DEBIT') {
          balance += debit - credit;
        } else {
          balance += credit - debit;
        }
      }

      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        balanceType: account.balanceType,
        balance,
        asOfDate: input.asOfDate || new Date(),
      };
    }),

  // Get accounts in hierarchical tree structure
  getHierarchy: protectedProcedure
    .input(
      z.object({
        accountType: z.nativeEnum(AccountType).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get all accounts for this user
      const accounts = await ctx.prisma.account.findMany({
        where: {
          userId: ctx.user.id,
          active: true,
          ...(input.accountType && { accountType: input.accountType }),
        },
        include: {
          parent: true,
          children: true,
        },
        orderBy: {
          code: 'asc',
        },
      });

      // Build hierarchy (accounts with no parent are root)
      const buildTree = (parentId: string | null): any[] => {
        return accounts
          .filter(a => a.parentId === parentId)
          .map(account => ({
            ...account,
            children: buildTree(account.id),
          }));
      };

      return buildTree(null);
    }),
});
