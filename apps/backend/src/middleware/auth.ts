import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../utils/env';

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

export const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

  const refreshToken = jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
};

export const verifyRefreshToken = (token: string): string | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch (error) {
    return null;
  }
};
