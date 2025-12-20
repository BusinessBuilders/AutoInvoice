import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { generateServiceEmbedding } from '../services/embeddings';
import { Prisma } from '@prisma/client';

const createServiceSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  category: z.string(),
  description: z.string().optional(),
  basePrice: z.number().optional(),
  priceUnit: z.string().optional(),
});

export const serviceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.service.findMany({
      where: { userId: ctx.user.id },
      orderBy: { category: 'asc' },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.service.findUnique({
        where: {
          id: input.id,
          userId: ctx.user.id, // Only return if owned by current user
        },
      });
    }),

  create: protectedProcedure
    .input(createServiceSchema)
    .mutation(async ({ ctx, input }) => {
      // Generate embedding for semantic search
      const embedding = await generateServiceEmbedding({
        name: input.name,
        code: input.code,
        description: input.description,
        category: input.category,
      });

      // Create service without embedding first
      const service = await ctx.prisma.service.create({
        data: {
          ...input,
          userId: ctx.user.id, // Set owner
        },
      });

      // Then update with embedding via raw SQL
      if (embedding) {
        await ctx.prisma.$executeRaw`
          UPDATE "Service"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${service.id}
        `;
      }

      return service;
    }),

  update: protectedProcedure
    .input(createServiceSchema.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Regenerate embedding if any relevant fields changed
      let embedding: number[] | null = null;
      if (data.name || data.code || data.description || data.category) {
        const existing = await ctx.prisma.service.findUnique({
          where: {
            id,
            userId: ctx.user.id, // Only allow updating own services
          },
        });

        if (existing) {
          embedding = await generateServiceEmbedding({
            name: data.name || existing.name,
            code: data.code || existing.code,
            description: data.description !== undefined ? data.description : existing.description,
            category: data.category || existing.category,
          });
        }
      }

      // Update service data without embedding first
      const service = await ctx.prisma.service.update({
        where: {
          id,
          userId: ctx.user.id, // Only update own services
        },
        data: {
          ...data,
        },
      });

      // Then update embedding via raw SQL if it was regenerated
      if (embedding) {
        await ctx.prisma.$executeRaw`
          UPDATE "Service"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${id}
        `;
      }

      return service;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.service.delete({
        where: {
          id: input.id,
          userId: ctx.user.id, // Only delete own services
        },
      });
    }),
});
