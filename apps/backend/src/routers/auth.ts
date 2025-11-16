import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import bcrypt from 'bcryptjs';
import {
  generateTokens,
  verifyAndRotateRefreshToken,
  revokeAllUserTokens,
  revokeToken,
} from '../middleware/auth';
import { TRPCError } from '@trpc/server';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

const logoutSchema = z.object({
  refreshToken: z.string(),
});

export const authRouter = router({
  // Register new user
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      const { email, password, name } = input;

      // Check if user already exists
      const existingUser = await ctx.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User with this email already exists',
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await ctx.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
        },
      });

      // Generate tokens
      const tokens = await generateTokens(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        ...tokens,
      };
    }),

  // Login
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ ctx, input }) => {
      const { email, password } = input;

      // Find user
      const user = await ctx.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Check if user is active
      if (!user.active) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Account is disabled. Contact support.',
        });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Generate tokens
      const tokens = await generateTokens(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        ...tokens,
      };
    }),

  // Refresh access token (with rotation)
  refresh: publicProcedure
    .input(refreshTokenSchema)
    .mutation(async ({ input }) => {
      const result = await verifyAndRotateRefreshToken(input.refreshToken);

      if (!result) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired refresh token',
        });
      }

      return result.newTokens;
    }),

  // Logout (revoke single device)
  logout: publicProcedure
    .input(logoutSchema)
    .mutation(async ({ input }) => {
      const revoked = await revokeToken(input.refreshToken);

      if (!revoked) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Token not found or already revoked',
        });
      }

      return { success: true, message: 'Logged out successfully' };
    }),

  // Logout all devices
  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    await revokeAllUserTokens(ctx.user.id);

    return { success: true, message: 'Logged out from all devices' };
  }),

  // Get current user active sessions
  getSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.prisma.refreshToken.findMany({
      where: {
        userId: ctx.user.id,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions;
  }),

  // Revoke specific session
  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.refreshToken.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.user.id,
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session not found',
        });
      }

      await ctx.prisma.refreshToken.update({
        where: { id: input.sessionId },
        data: { revoked: true, revokedAt: new Date() },
      });

      return { success: true, message: 'Session revoked' };
    }),
});
