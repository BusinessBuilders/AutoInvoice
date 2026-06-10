import { initTRPC, TRPCError } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import jwt from 'jsonwebtoken';
import { env } from './utils/env';
import { prisma } from './utils/db';

// Context creation
export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
  // Extract token from Authorization header
  const token = req.headers.authorization?.replace('Bearer ', '');

  let userId: string | null = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      userId = decoded.userId;
    } catch (error) {
      // Invalid token - will be handled by protected procedures
    }
  }

  return {
    req,
    res,
    userId,
    prisma,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

// Initialize tRPC
const t = initTRPC.context<Context>().create();

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure - requires authentication
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  // Fetch the full user object
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.userId },
  });

  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not found' });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      user,
    },
  });
});

export const middleware = t.middleware;
