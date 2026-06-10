import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const createExpenseCategorySchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  accountId: z.string().optional(),
  parentId: z.string().optional(),
  active: z.boolean().default(true),
  requiresReceipt: z.boolean().default(true),
  taxDeductible: z.boolean().default(true),
  taxCategory: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const updateExpenseCategorySchema = createExpenseCategorySchema.partial().extend({
  id: z.string(),
});

export const expenseCategoryRouter = router({
  // List all expense categories
  list: protectedProcedure
    .input(
      z.object({
        active: z.boolean().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { active, search } = input;

      const categories = await ctx.prisma.expenseCategory.findMany({
        where: {
          userId: ctx.user.id,
          ...(active !== undefined && { active }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }),
        },
        include: {
          account: true,
          parent: true,
          children: true,
          _count: {
            select: {
              receipts: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      return categories;
    }),

  // Get expense category by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const category = await ctx.prisma.expenseCategory.findUnique({
        where: { id: input.id },
        include: {
          account: true,
          parent: true,
          children: true,
          receipts: {
            orderBy: {
              date: 'desc',
            },
            take: 20,
          },
          _count: {
            select: {
              receipts: true,
            },
          },
        },
      });

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Expense category not found',
        });
      }

      // Verify user owns the category
      if (category.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied to this expense category',
        });
      }

      return category;
    }),

  // Create expense category
  create: protectedProcedure
    .input(createExpenseCategorySchema)
    .mutation(async ({ ctx, input }) => {
      // Check if name already exists for this user
      const existing = await ctx.prisma.expenseCategory.findUnique({
        where: {
          userId_name: {
            userId: ctx.user.id,
            name: input.name,
          }
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Expense category with name "${input.name}" already exists`,
        });
      }

      // If code provided, check uniqueness for this user
      if (input.code) {
        const existingCode = await ctx.prisma.expenseCategory.findUnique({
          where: {
            userId_code: {
              userId: ctx.user.id,
              code: input.code,
            }
          },
        });

        if (existingCode) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Expense category with code "${input.code}" already exists`,
          });
        }
      }

      // If parent specified, verify it exists
      if (input.parentId) {
        const parent = await ctx.prisma.expenseCategory.findUnique({
          where: { id: input.parentId },
        });

        if (!parent) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Parent category not found',
          });
        }
      }

      // If account specified, verify it exists
      if (input.accountId) {
        const account = await ctx.prisma.account.findUnique({
          where: { id: input.accountId },
        });

        if (!account) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Account not found',
          });
        }
      }

      return ctx.prisma.expenseCategory.create({
        data: {
          ...input,
          userId: ctx.user.id,
        },
        include: {
          account: true,
          parent: true,
          children: true,
        },
      });
    }),

  // Update expense category
  update: protectedProcedure
    .input(updateExpenseCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Check if category exists
      const category = await ctx.prisma.expenseCategory.findUnique({
        where: { id },
      });

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Expense category not found',
        });
      }

      // Verify user owns the category
      if (category.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied to this expense category',
        });
      }

      // If name is being changed, check uniqueness for this user
      if (data.name && data.name !== category.name) {
        const existing = await ctx.prisma.expenseCategory.findUnique({
          where: {
            userId_name: {
              userId: ctx.user.id,
              name: data.name,
            }
          },
        });

        if (existing) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Expense category with name "${data.name}" already exists`,
          });
        }
      }

      // If code is being changed, check uniqueness for this user
      if (data.code && data.code !== category.code) {
        const existing = await ctx.prisma.expenseCategory.findUnique({
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
            message: `Expense category with code "${data.code}" already exists`,
          });
        }
      }

      // If parent is being changed, verify it exists and prevent circular reference
      if (data.parentId !== undefined && data.parentId !== category.parentId) {
        if (data.parentId) {
          const parent = await ctx.prisma.expenseCategory.findUnique({
            where: { id: data.parentId },
          });

          if (!parent) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Parent category not found',
            });
          }

          // Prevent circular reference
          if (parent.parentId === id) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot set parent to a child category',
            });
          }
        }
      }

      // If account is being changed, verify it exists
      if (data.accountId !== undefined && data.accountId !== category.accountId) {
        if (data.accountId) {
          const account = await ctx.prisma.account.findUnique({
            where: { id: data.accountId },
          });

          if (!account) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Account not found',
            });
          }
        }
      }

      return ctx.prisma.expenseCategory.update({
        where: { id },
        data: data as any,
        include: {
          account: true,
          parent: true,
          children: true,
        },
      });
    }),

  // Soft delete expense category (set inactive)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.expenseCategory.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              receipts: true,
              children: true,
            },
          },
        },
      });

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Expense category not found',
        });
      }

      // Prevent deleting categories with children
      if (category._count.children > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete category with child categories. Delete or reassign children first.',
        });
      }

      // Soft delete by setting inactive
      return ctx.prisma.expenseCategory.update({
        where: { id: input.id },
        data: { active: false },
      });
    }),

  // Link a category to a receipt
  linkToReceipt: protectedProcedure
    .input(
      z.object({
        categoryId: z.string(),
        receiptId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify category exists
      const category = await ctx.prisma.expenseCategory.findUnique({
        where: { id: input.categoryId },
      });

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Expense category not found',
        });
      }

      if (!category.active) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot link to an inactive expense category',
        });
      }

      // Verify receipt exists
      const receipt = await ctx.prisma.receipt.findUnique({
        where: { id: input.receiptId },
      });

      if (!receipt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Receipt not found',
        });
      }

      // Link category to receipt
      return ctx.prisma.receipt.update({
        where: { id: input.receiptId },
        data: {
          expenseCategoryId: input.categoryId,
        },
        include: {
          expenseCategory: true,
        },
      });
    }),
});
