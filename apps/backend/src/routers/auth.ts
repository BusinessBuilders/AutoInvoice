import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
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
  twoFactorCode: z.string().optional(),
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

const verifyEmailSchema = z.object({
  token: z.string(),
});

const enable2FASchema = z.object({
  code: z.string().length(6),
});

const verify2FASchema = z.object({
  code: z.string().length(6),
});

export const authRouter = router({
  // Register new user
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      const { email, password, name } = input;

      const existingUser = await ctx.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User with this email already exists',
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await ctx.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
        },
      });

      // Generate email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await ctx.prisma.passwordReset.create({
        data: {
          userId: user.id,
          token: verificationToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      // Send verification email
      await emailService.sendEmailVerification(user.email, verificationToken, user.name);

      const tokens = await generateTokens(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
        },
        ...tokens,
      };
    }),

  // Login
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ ctx, input }) => {
      const { email, password, twoFactorCode } = input;

      const user = await ctx.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      if (!user.active) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Account is disabled. Contact support.',
        });
      }

      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Check 2FA if enabled
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        if (!twoFactorCode) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '2FA code required',
          });
        }

        const verified = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: twoFactorCode,
          window: 2,
        });

        if (!verified) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid 2FA code',
          });
        }
      }

      const tokens = await generateTokens(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
        },
        ...tokens,
      };
    }),

  // Verify email
  verifyEmail: publicProcedure
    .input(verifyEmailSchema)
    .mutation(async ({ ctx, input }) => {
      const resetToken = await ctx.prisma.passwordReset.findUnique({
        where: { token: input.token },
        include: { user: true },
      });

      if (!resetToken || resetToken.expiresAt < new Date() || resetToken.used) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid or expired verification token',
        });
      }

      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: resetToken.userId },
          data: { emailVerified: true, emailVerifiedAt: new Date() },
        }),
        ctx.prisma.passwordReset.update({
          where: { id: resetToken.id },
          data: { used: true, usedAt: new Date() },
        }),
      ]);

      return { success: true, message: 'Email verified successfully' };
    }),

  // Setup 2FA
  setup2FA: protectedProcedure.mutation(async ({ ctx }) => {
    const secret = speakeasy.generateSecret({
      name: `LeadFlow Pro (${ctx.user.email})`,
      issuer: 'LeadFlow Pro',
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    // Store temporarily (will be enabled after verification)
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { twoFactorSecret: secret.base32 },
    });

    return {
      secret: secret.base32,
      qrCode,
    };
  }),

  // Enable 2FA
  enable2FA: protectedProcedure
    .input(enable2FASchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user?.twoFactorSecret) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Setup 2FA first',
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: input.code,
        window: 2,
      });

      if (!verified) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid code',
        });
      }

      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { twoFactorEnabled: true },
      });

      return { success: true, message: '2FA enabled successfully' };
    }),

  // Disable 2FA
  disable2FA: protectedProcedure
    .input(verify2FASchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user?.twoFactorSecret) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '2FA not enabled',
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: input.code,
        window: 2,
      });

      if (!verified) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid code',
        });
      }

      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });

      return { success: true, message: '2FA disabled successfully' };
    }),

  // Refresh token
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

  // Logout
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

  // Get sessions
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

  // Revoke session
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

      const user = await ctx.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return {
          success: true,
          message: 'If an account exists, a password reset email has been sent',
        };
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await ctx.prisma.passwordReset.create({
        data: {
          userId: user.id,
          token: resetToken,
          expiresAt,
        },
      });

      await emailService.sendPasswordReset(user.email, resetToken, user.name);

      return {
        success: true,
        message: 'If an account exists, a password reset email has been sent',
      };
    }),

  // Reset password
  resetPassword: publicProcedure
    .input(resetPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const { token, newPassword } = input;

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

      if (resetToken.expiresAt < new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Reset token has expired',
        });
      }

      if (resetToken.used) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Reset token has already been used',
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        }),
        ctx.prisma.passwordReset.update({
          where: { id: resetToken.id },
          data: { used: true, usedAt: new Date() },
        }),
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

  /** Crew self-signup (spec: EMPLOYEE accounts, no owner dashboard). Gated by
   * the CREW_SIGNUP_CODE the owner shares with the crew. */
  registerEmployee: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        password: z.string().min(6),
        inviteCode: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const expected = process.env.CREW_SIGNUP_CODE;
      if (!expected) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Crew signup is not enabled (CREW_SIGNUP_CODE not configured)',
        });
      }
      if (input.inviteCode !== expected) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid invite code' });
      }
      const existing = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'User with this email already exists' });
      }
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const user = await ctx.prisma.user.create({
        data: {
          email: input.email,
          password: hashedPassword,
          name: input.name,
          phone: input.phone,
          role: 'EMPLOYEE',
        },
      });
      const tokens = await generateTokens(user.id);
      return {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        ...tokens,
      };
    }),
});
