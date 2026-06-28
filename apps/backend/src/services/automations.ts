import { JobStatus, SubscriptionStatus, TaskType, Priority } from '@prisma/client';
import { prisma } from '../utils/db';
import logger from '../utils/logger';

/**
 * Agent-led automations (spec §3.10). Rules are code with per-rule config —
 * not a rules engine. Every firing is:
 *  - recorded in AutomationLog (DB-unique → fire-once per entity/stage),
 *  - surfaced as a Task (actionable) and/or Activity (timeline-visible).
 * Nothing silently mutates business state except flag fields (churnRisk).
 * Run via the repeatable queue job or invoke runAutomations() directly.
 */

export interface AutomationConfig {
  agingQuoteDays: number;       // SENT/VIEWED older than this → nudge
  postJobReviewDays: number;    // days after CLOSED → review request
  renewalReminderDays: number;  // days before currentPeriodEnd → reminder
  dunningStageDays: number[];   // days PAST_DUE before stage 1, 2, 3 fire
}

export const DEFAULT_CONFIG: AutomationConfig = {
  agingQuoteDays: 7,
  postJobReviewDays: 2,
  renewalReminderDays: 7,
  dunningStageDays: [3, 7, 14],
};

type Fired = { rule: string; entityType: string; entityId: string; summary: string };

/** Atomically claim a (rule, entity) slot; false if already fired. */
async function claim(
  rule: string,
  entityType: string,
  entityId: string,
  companyId: string | null,
  result?: object
): Promise<boolean> {
  try {
    await prisma.automationLog.create({
      data: { rule, entityType, entityId, companyId, result },
    });
    return true;
  } catch (err: any) {
    if (err?.code === 'P2002') return false; // unique violation = already fired
    throw err;
  }
}

async function notify(opts: {
  userId: string;
  companyId?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  taskTitle: string;
  taskType: TaskType;
  body: string;
  priority?: Priority;
  dueDate?: Date;
}) {
  await prisma.task.create({
    data: {
      title: opts.taskTitle,
      type: opts.taskType,
      createdById: opts.userId,
      assignedToId: opts.userId,
      customerId: opts.customerId ?? undefined,
      leadId: opts.leadId ?? undefined,
      priority: opts.priority ?? Priority.MEDIUM,
      dueDate: opts.dueDate,
      notes: opts.body,
    },
  });
  await prisma.activity.create({
    data: {
      userId: opts.userId,
      companyId: opts.companyId ?? undefined,
      customerId: opts.customerId ?? undefined,
      leadId: opts.leadId ?? undefined,
      type: 'SYSTEM',
      body: opts.body,
      source: 'automation',
    },
  });
}

export async function runAutomations(
  now: Date = new Date(),
  config: AutomationConfig = DEFAULT_CONFIG
): Promise<Fired[]> {
  const fired: Fired[] = [];
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  const daysAhead = (n: number) => new Date(now.getTime() + n * 86400000);

  // 1. aging_quote_nudge — open quotes going stale
  const agingQuotes = await prisma.quote.findMany({
    where: {
      status: { in: ['SENT', 'VIEWED'] },
      sentAt: { lte: daysAgo(config.agingQuoteDays) },
      userId: { not: null },
    },
    include: { customer: { select: { id: true, name: true } }, lead: { select: { id: true, name: true } } },
  });
  for (const q of agingQuotes) {
    if (!(await claim('aging_quote_nudge', 'quote', q.id, q.companyId))) continue;
    const who = q.customer?.name ?? q.lead?.name ?? 'prospect';
    await notify({
      userId: q.userId!,
      companyId: q.companyId,
      customerId: q.customerId,
      leadId: q.leadId,
      taskTitle: `Follow up on quote ${q.quoteNumber} (${who})`,
      taskType: TaskType.FOLLOW_UP,
      body: `Quote ${q.quoteNumber} ($${Number(q.total).toFixed(2)}) has been open ${config.agingQuoteDays}+ days without a decision — nudge ${who}.`,
      priority: Priority.HIGH,
    });
    fired.push({ rule: 'aging_quote_nudge', entityType: 'quote', entityId: q.id, summary: q.quoteNumber });
  }

  // 2. post_job_review — review request after job closed
  const reviewJobs = await prisma.job.findMany({
    where: { status: JobStatus.CLOSED, completedAt: { lte: daysAgo(config.postJobReviewDays) } },
  });
  for (const j of reviewJobs) {
    if (!(await claim('post_job_review', 'job', j.id, j.companyId))) continue;
    await notify({
      userId: j.userId,
      companyId: j.companyId,
      customerId: j.customerId,
      taskTitle: `Request review for job ${j.jobNumber}`,
      taskType: TaskType.CALL_CUSTOMER,
      body: `Job ${j.jobNumber} (${j.title}) closed — ask the customer for a review/feedback.`,
    });
    fired.push({ rule: 'post_job_review', entityType: 'job', entityId: j.id, summary: j.jobNumber });
  }

  // 3. renewal_reminder — renewals due soon
  const renewing = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: { lte: daysAhead(config.renewalReminderDays), gte: now },
    },
  });
  for (const s of renewing) {
    // key embeds the period so next period's renewal reminds again
    const rule = `renewal_reminder:${s.currentPeriodEnd.toISOString().slice(0, 10)}`;
    if (!(await claim(rule, 'subscription', s.id, s.companyId))) continue;
    await notify({
      userId: s.userId,
      companyId: s.companyId,
      customerId: s.customerId,
      taskTitle: `Renewal due: ${s.name}`,
      taskType: TaskType.COLLECT_PAYMENT,
      body: `Subscription "${s.name}" ($${Number(s.amount).toFixed(2)}/${s.interval.toLowerCase()}) renews ${s.currentPeriodEnd.toISOString().slice(0, 10)}.`,
      dueDate: s.currentPeriodEnd,
    });
    fired.push({ rule: 'renewal_reminder', entityType: 'subscription', entityId: s.id, summary: s.name });
  }

  // 4. dunning — escalate past-due subscriptions by age
  const pastDue = await prisma.subscription.findMany({
    where: { status: SubscriptionStatus.PAST_DUE },
  });
  for (const s of pastDue) {
    const overdueDays = Math.floor((now.getTime() - s.currentPeriodEnd.getTime()) / 86400000);
    let stage = 0;
    for (let i = 0; i < config.dunningStageDays.length; i++) {
      if (overdueDays >= config.dunningStageDays[i]) stage = i + 1;
    }
    if (stage === 0) continue;
    const rule = `dunning:${stage}:${s.currentPeriodEnd.toISOString().slice(0, 10)}`;
    if (!(await claim(rule, 'subscription', s.id, s.companyId))) continue;
    await prisma.subscription.update({
      where: { id: s.id },
      data: { dunningStage: Math.max(s.dunningStage, stage) },
    });
    await notify({
      userId: s.userId,
      companyId: s.companyId,
      customerId: s.customerId,
      taskTitle: `Dunning (stage ${stage}): ${s.name}`,
      taskType: TaskType.COLLECT_PAYMENT,
      body: `Subscription "${s.name}" is ${overdueDays} days past due (dunning stage ${stage} of 3).`,
      priority: stage >= 2 ? Priority.URGENT : Priority.HIGH,
    });
    fired.push({ rule: `dunning:${stage}`, entityType: 'subscription', entityId: s.id, summary: s.name });
  }

  // 5. churn_risk — long past due
  const churning = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodEnd: { lte: daysAgo(config.dunningStageDays[2] ?? 14) },
      churnRisk: false,
    },
  });
  for (const s of churning) {
    const rule = `churn_risk:${s.currentPeriodEnd.toISOString().slice(0, 10)}`;
    if (!(await claim(rule, 'subscription', s.id, s.companyId))) continue;
    await prisma.subscription.update({
      where: { id: s.id },
      data: { churnRisk: true, churnReason: 'renewal overdue beyond final dunning stage' },
    });
    await notify({
      userId: s.userId,
      companyId: s.companyId,
      customerId: s.customerId,
      taskTitle: `Churn risk: ${s.name}`,
      taskType: TaskType.CALL_CUSTOMER,
      body: `Subscription "${s.name}" flagged churn-risk — renewal overdue beyond final dunning stage. Call them.`,
      priority: Priority.URGENT,
    });
    fired.push({ rule: 'churn_risk', entityType: 'subscription', entityId: s.id, summary: s.name });
  }

  // 6. restock — stock at/below threshold
  const lowStock = await prisma.product.findMany({
    where: { active: true, lowStockThreshold: { gt: 0 } },
  });
  for (const p of lowStock) {
    if (p.stockQty > p.lowStockThreshold) continue;
    // key embeds current qty so a restock then re-drop alerts again
    const rule = `restock:${p.stockQty}`;
    if (!(await claim(rule, 'product', p.id, p.companyId))) continue;
    await notify({
      userId: p.userId,
      companyId: p.companyId,
      taskTitle: `Restock ${p.sku}`,
      taskType: TaskType.OTHER,
      body: `Product ${p.sku} (${p.name}) is at ${p.stockQty} units (threshold ${p.lowStockThreshold}) — restock.`,
      priority: Priority.HIGH,
    });
    fired.push({ rule: 'restock', entityType: 'product', entityId: p.id, summary: p.sku });
  }

  if (fired.length > 0) {
    logger.info(`Automations fired: ${fired.length}`, { rules: fired.map((f) => f.rule) });
  }
  return fired;
}
