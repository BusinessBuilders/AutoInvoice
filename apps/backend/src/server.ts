import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers';
import { createContext } from './trpc';
import { env } from './utils/env';
import logger from './utils/logger';
import multer from 'multer';
import path from 'path';
import { oauthHandlers } from './services/google/oauth';
import { bot } from './services/telegram/bot';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: true, // Allow all origins in development - TEMPORARY FIX
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files (logos, etc.)
app.use('/logos', express.static(path.join(env.UPLOAD_DIR, 'logos')));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(env.MAX_FILE_SIZE),
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      database: 'ok',
      redis: 'ok',
      telegram: bot ? 'enabled' : 'disabled',
    }
  });
});

// Metrics endpoint (for monitoring)
app.get('/metrics', async (req, res) => {
  try {
    const { prisma } = await import('./utils/db');

    const [invoiceCount, customerCount, queueStats] = await Promise.all([
      prisma.invoice.count(),
      prisma.customer.count(),
      // TODO: Get queue stats from BullMQ
      Promise.resolve({ pending: 0, active: 0, completed: 0, failed: 0 })
    ]);

    res.json({
      invoices: { total: invoiceCount },
      customers: { total: customerCount },
      queues: queueStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Google OAuth routes
app.get('/auth/google', oauthHandlers.initiateAuth);
app.get('/auth/google/callback', oauthHandlers.handleCallback);
app.post('/auth/google/revoke', oauthHandlers.revokeAccess);

// Telegram webhook endpoint (for production deployment)
app.post('/webhook/telegram', async (req, res) => {
  if (bot) {
    try {
      await bot.handleUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      logger.error('Telegram webhook error:', error);
      res.sendStatus(500);
    }
  } else {
    res.status(404).json({ error: 'Telegram bot not configured' });
  }
});

// tRPC middleware
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, type, path, input, ctx, req }) {
      logger.error('tRPC Error:', {
        error: error.message,
        type,
        path,
        input,
        stack: error.stack,
      });
    },
  })
);

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    filename: req.file.filename,
    path: req.file.path,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Express Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;
