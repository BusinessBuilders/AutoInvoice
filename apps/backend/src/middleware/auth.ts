import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../utils/env';
import { prisma } from '../utils/prisma';

export interface AuthRequest extends Request {
  userId?: string;
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

/**
 * Generate access and refresh tokens
 * Refresh token is stored in database for rotation/revocation
 */
export const generateTokens = async (
  userId: string,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
  }
) => {
  // Generate short-lived access token (15 minutes)
  const accessToken = jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN || '15m',
  });

  // Generate long-lived refresh token (7 days)
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(
    Date.now() + (parseInt(env.REFRESH_TOKEN_EXPIRES_IN) || 7 * 24 * 60 * 60 * 1000)
  );

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId,
      expiresAt,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    },
  });

  return { accessToken, refreshToken, expiresAt };
};

/**
 * Verify and rotate refresh token
 * Returns userId if valid, null if invalid/expired/revoked
 */
export const verifyAndRotateRefreshToken = async (
  token: string,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
  }
): Promise<{ userId: string; newTokens: Awaited<ReturnType<typeof generateTokens>> } | null> => {
  try {
    // Find refresh token in database
    const refreshTokenRecord = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!refreshTokenRecord) {
      return null;
    }

    // Check if token is expired
    if (refreshTokenRecord.expiresAt < new Date()) {
      return null;
    }

    // Check if token is revoked
    if (refreshTokenRecord.revoked) {
      // Token reuse detected! Revoke all tokens for this user (security breach)
      await prisma.refreshToken.updateMany({
        where: { userId: refreshTokenRecord.userId },
        data: { revoked: true, revokedAt: new Date() },
      });
      return null;
    }

    // Generate new tokens (token rotation)
    const newTokens = await generateTokens(refreshTokenRecord.userId, metadata);

    // Mark old token as revoked and point to new one
    await prisma.refreshToken.update({
      where: { id: refreshTokenRecord.id },
      data: {
        revoked: true,
        revokedAt: new Date(),
        replacedBy: newTokens.refreshToken,
      },
    });

    return {
      userId: refreshTokenRecord.userId,
      newTokens,
    };
  } catch (error) {
    console.error('Error verifying refresh token:', error);
    return null;
  }
};

/**
 * Revoke all refresh tokens for a user (logout all devices)
 */
export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });
};

/**
 * Revoke specific refresh token (logout single device)
 */
export const revokeToken = async (token: string): Promise<boolean> => {
  try {
    const result = await prisma.refreshToken.update({
      where: { token },
      data: { revoked: true, revokedAt: new Date() },
    });
    return !!result;
  } catch (error) {
    return false;
  }
};

/**
 * Clean up expired tokens (run as cron job)
 */
export const cleanupExpiredTokens = async (): Promise<number> => {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revoked: true, revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, // 30 days old
      ],
    },
  });
  return result.count;
};
