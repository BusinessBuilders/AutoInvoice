import crypto from 'crypto';
import type { Request, Response } from 'express';
import { prisma } from '../../utils/db';
import logger from '../../utils/logger';
import { ingestOrder } from './ingest-order';

/**
 * Order webhook security (spec §3.6):
 *   X-AutoInvoice-Signature: sha256=<hex HMAC-SHA256(rawBody, source.secret)>
 *   X-AutoInvoice-Timestamp: ISO timestamp, rejected beyond ±5 min skew
 * Replays of the same order payload are idempotent (200 {status:"duplicate"}).
 */

const MAX_SKEW_MS = 5 * 60 * 1000;

export function verifySignature(rawBody: Buffer, secret: string, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = header.slice('sha256='.length);
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

export async function handleOrderWebhook(req: Request, res: Response): Promise<Response> {
  const sourceKey = req.params.sourceKey;
  const rawBody = req.body as Buffer;

  const source = await prisma.ingestSource.findUnique({ where: { key: sourceKey } });
  if (!source || !source.active) {
    return res.status(404).json({ error: 'Unknown ingest source' });
  }

  const ts = req.headers['x-autoinvoice-timestamp'] as string | undefined;
  if (!ts || Math.abs(Date.now() - new Date(ts).getTime()) > MAX_SKEW_MS) {
    return res.status(401).json({ error: 'Missing or stale timestamp' });
  }

  const sig = req.headers['x-autoinvoice-signature'] as string | undefined;
  if (!verifySignature(rawBody, source.secret, sig)) {
    logger.warn('Order webhook signature rejected', { sourceKey });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  try {
    const result = await ingestOrder(sourceKey, payload);
    return res.status(200).json({
      status: result.duplicate ? 'duplicate' : 'ok',
      orderId: result.orderId,
      orderStatus: result.status,
      needsReview: result.needsReview,
    });
  } catch (err) {
    logger.error('Order ingestion failed', {
      sourceKey,
      error: err instanceof Error ? err.message : err,
    });
    return res.status(422).json({ error: err instanceof Error ? err.message : 'Ingestion failed' });
  }
}
