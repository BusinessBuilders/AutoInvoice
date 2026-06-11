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
import Stripe from 'stripe';
import { prisma } from './utils/db';

const app = express();

// Initialize Stripe for webhooks
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Business OS order ingestion (spec §3.6) - raw body for HMAC verification,
// MUST be before body parsing middleware
app.get('/webhook/orders/health', (_req, res) => res.json({ status: 'ok' }));
app.post(
  '/webhook/orders/:sourceKey',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const { handleOrderWebhook } = await import('./services/commerce/webhook');
    return handleOrderWebhook(req, res);
  }
);

// Stripe webhook - MUST be before body parsing middleware
// Stripe requires raw body for signature verification
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (webhookSecret) {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // In development, skip signature verification
      event = JSON.parse(req.body.toString()) as Stripe.Event;
      logger.warn('⚠️ Stripe webhook signature not verified (no STRIPE_WEBHOOK_SECRET)');
    }
  } catch (err: any) {
    logger.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info('Payment completed:', { sessionId: session.id, metadata: session.metadata });

        // Find and update the plow billing record
        if (session.metadata?.type === 'plow_billing' && session.payment_link) {
          const billing = await prisma.plowBilling.findFirst({
            where: { stripePaymentLinkId: session.payment_link as string },
          });

          if (billing) {
            await prisma.plowBilling.update({
              where: { id: billing.id },
              data: {
                status: 'PAID',
                paidAt: new Date(),
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent as string,
              },
            });
            logger.info('PlowBilling marked as PAID:', { billingId: billing.id });
          }
        }
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const stripeSubId = typeof (inv as any).subscription === 'string' ? (inv as any).subscription : (inv as any).subscription?.id;
        if (stripeSubId) {
          const { handleStripeSubscriptionEvent } = await import('./services/subscriptions');
          const result = await handleStripeSubscriptionEvent({
            type: event.type,
            stripeSubscriptionId: stripeSubId,
            metadataSubscriptionId: (inv as any).subscription_details?.metadata?.autoinvoiceSubscriptionId
              ?? (inv.metadata as any)?.autoinvoiceSubscriptionId ?? null,
            paidAt: new Date(((inv as any).status_transitions?.paid_at ?? event.created) * 1000),
          });
          if (result) logger.info(`Stripe ${event.type} → subscription synced`, { stripeSubId });
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logger.info('PaymentIntent succeeded:', { id: paymentIntent.id });
        break;
      }

      default:
        logger.info('Unhandled Stripe event:', { type: event.type });
    }

    res.json({ received: true });
  } catch (err: any) {
    logger.error('Error processing Stripe webhook:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

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
