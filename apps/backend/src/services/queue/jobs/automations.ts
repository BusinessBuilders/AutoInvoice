import { Queue, Worker } from 'bullmq';
import { connection } from '../client';
import { runAutomations } from '../../automations';
import logger from '../../../utils/logger';

/** Business OS automations (spec §3.10): hourly sweep, fire-once per entity
 * via AutomationLog, output = Tasks + Activities. */

export const AUTOMATIONS_QUEUE = 'business-os-automations';

export const automationsQueue = new Queue(AUTOMATIONS_QUEUE, { connection });

export const automationsWorker = new Worker(
  AUTOMATIONS_QUEUE,
  async () => {
    const fired = await runAutomations();
    return { fired: fired.length, rules: fired.map((f) => `${f.rule}:${f.summary}`) };
  },
  { connection }
);

automationsWorker.on('completed', (job, result) => {
  if (result?.fired > 0) {
    logger.info(`Automations sweep fired ${result.fired} rule(s)`, result);
  }
});

automationsWorker.on('failed', (job, err) => {
  logger.error('Automations sweep failed', { error: err.message });
});

/** Register the hourly repeatable sweep (idempotent — BullMQ dedupes by jobId). */
export async function scheduleAutomations(): Promise<void> {
  await automationsQueue.add(
    'sweep',
    {},
    {
      repeat: { pattern: '0 * * * *' }, // hourly on the hour
      jobId: 'business-os-automations-sweep',
    }
  );
  logger.info('✅ Business OS automations sweep scheduled (hourly)');
}
