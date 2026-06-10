import { describe, it, expect, beforeEach } from '@jest/globals';
import { prisma } from '../utils/prisma';
import { generateTokens, verifyAndRotateRefreshToken } from '../middleware/auth';
import bcrypt from 'bcryptjs';

describe('Authentication', () => {
  let testUser: any;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('Test123!@#', 10);
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
      },
    });
  });

  describe('Token Generation', () => {
    it('should generate access and refresh tokens', async () => {
      const tokens = await generateTokens(testUser.id);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresAt');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should store refresh token in database', async () => {
      const tokens = await generateTokens(testUser.id);

      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: tokens.refreshToken },
      });

      expect(storedToken).toBeTruthy();
      expect(storedToken?.userId).toBe(testUser.id);
      expect(storedToken?.revoked).toBe(false);
    });
  });

  describe('Token Rotation', () => {
    it('should rotate refresh token successfully', async () => {
      const oldTokens = await generateTokens(testUser.id);
      const result = await verifyAndRotateRefreshToken(oldTokens.refreshToken);

      expect(result).toBeTruthy();
      expect(result?.userId).toBe(testUser.id);
      expect(result?.newTokens.refreshToken).not.toBe(oldTokens.refreshToken);

      // Old token should be revoked
      const oldToken = await prisma.refreshToken.findUnique({
        where: { token: oldTokens.refreshToken },
      });
      expect(oldToken?.revoked).toBe(true);
    });

    it('should detect token reuse and revoke all tokens', async () => {
      const tokens = await generateTokens(testUser.id);

      // First rotation
      await verifyAndRotateRefreshToken(tokens.refreshToken);

      // Try to reuse old token (should revoke all)
      const result = await verifyAndRotateRefreshToken(tokens.refreshToken);
      expect(result).toBeNull();

      // All tokens should be revoked
      const allTokens = await prisma.refreshToken.findMany({
        where: { userId: testUser.id },
      });
      expect(allTokens.every(t => t.revoked)).toBe(true);
    });

    it('should reject expired tokens', async () => {
      const tokens = await generateTokens(testUser.id);

      // Manually expire token
      await prisma.refreshToken.update({
        where: { token: tokens.refreshToken },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const result = await verifyAndRotateRefreshToken(tokens.refreshToken);
      expect(result).toBeNull();
    });
  });

  describe('Password Validation', () => {
    it('should validate correct password', async () => {
      const isValid = await bcrypt.compare('Test123!@#', testUser.password);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const isValid = await bcrypt.compare('wrongpassword', testUser.password);
      expect(isValid).toBe(false);
    });
  });
});
