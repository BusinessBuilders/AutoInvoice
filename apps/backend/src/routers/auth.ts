import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  generateTokens,
  verifyAndRotateRefreshToken,
  revokeAllUserTokens,
  revokeToken,
} from '../middleware/auth';
import { emailService } from '../utils/email';
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

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
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

  // Request password reset
  requestPasswordReset: publicProcedure
    .input(requestPasswordResetSchema)
    .mutation(async ({ ctx, input }) => {
      const { email } = input;

      // Find user by email
      const user = await ctx.prisma.user.findUnique({
        where: { email },
      });

      // Always return success (don't reveal if email exists)
      if (!user) {
        return {
          success: true,
          message: 'If an account exists, a password reset email has been sent',
        };
      }

      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token in database
      await ctx.prisma.passwordReset.create({
        data: {
          userId: user.id,
          token: resetToken,
          expiresAt,
        },
      });

      // Send password reset email
      await emailService.sendPasswordReset(user.email, resetToken, user.name);

      return {
        success: true,
        message: 'If an account exists, a password reset email has been sent',
      };
    }),

  // Reset password with token
  resetPassword: publicProcedure
    .input(resetPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const { token, newPassword } = input;

      // Find reset token
      const resetToken = await ctx.prisma.passwordReset.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!resetToken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid or expired reset token',
        });
      }

      // Check if token is expired
      if (resetToken.expiresAt < new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Reset token has expired',
        });
      }

      // Check if token was already used
      if (resetToken.used) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Reset token has already been used',
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password and mark token as used
      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        }),
        ctx.prisma.passwordReset.update({
          where: { id: resetToken.id },
          data: { used: true, usedAt: new Date() },
        }),
        // Revoke all existing refresh tokens (force re-login everywhere)
        ctx.prisma.refreshToken.updateMany({
          where: { userId: resetToken.userId },
          data: { revoked: true, revokedAt: new Date() },
        }),
      ]);

      return {
        success: true,
        message: 'Password reset successful. Please login with your new password.',
      };
    }),
});
