import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import bcrypt from 'bcryptjs';
import { generateTokens, verifyRefreshToken } from '../middleware/auth';
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
      const tokens = generateTokens(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
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

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Generate tokens
      const tokens = generateTokens(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        ...tokens,
      };
    }),

  // Refresh access token
  refresh: publicProcedure
    .input(refreshTokenSchema)
    .mutation(async ({ input }) => {
      const userId = verifyRefreshToken(input.refreshToken);

      if (!userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid refresh token',
        });
      }

      const tokens = generateTokens(userId);

      return tokens;
    }),
});
