import { Prisma, JobStatus, type Job } from '@prisma/client';
import { prisma } from '../utils/db';
import logger from '../utils/logger';
import { calculateDueDate } from '../utils/payment-terms';

/**
 * Field-service job lifecycle (spec §3.4).
 * REQUESTED → SCHEDULED → IN_PROGRESS → COMPLETED → CLOSED; CANCELLED from any
 * non-CLOSED state. Closing a job auto-creates its Invoice from the quote
 * lines (or a single line from the job costing); paying that invoice emits the
 * FIELD_SERVICE RevenueEvent — jobs never write the spine directly.
 */

export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  REQUESTED: [JobStatus.SCHEDULED, JobStatus.CANCELLED],
  SCHEDULED: [JobStatus.IN_PROGRESS, JobStatus.REQUESTED, JobStatus.CANCELLED],
  IN_PROGRESS: [JobStatus.COMPLETED, JobStatus.CANCELLED],
  COMPLETED: [JobStatus.CLOSED, JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  CLOSED: [],
  CANCELLED: [],
};

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!JOB_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid job transition ${from} → ${to}`);
  }
}

export async function nextJobNumber(userId: string): Promise<string> {
  const last = await prisma.job.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { jobNumber: true },
  });
  const lastNumber = last ? parseInt(last.jobNumber.replace(/\D/g, '')) || 0 : 0;
  return `J-${String(lastNumber + 1).padStart(5, '0')}`;
}

/**
 * Auto-create the invoice for a job being closed. Line items come from the
 * origin quote when present; otherwise a single line from the job title and
 * actual/estimated cost. Returns the created invoice.
 */
export async function createInvoiceForJob(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { quote: { include: { lineItems: { orderBy: { order: 'asc' } } } } },
  });
  if (!job) throw new Error('Job not found');
  if (job.invoiceId) {
    return prisma.invoice.findUnique({ where: { id: job.invoiceId } });
  }

  type Line = { description: string; quantity: number; unit: string | null; rate: number; amount: number; order: number };
  let lines: Line[];
  let taxRate = 0;
  let discount = 0;
  if (job.quote && job.quote.lineItems.length > 0) {
    lines = job.quote.lineItems.map((li, idx) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unit: li.unit,
      rate: Number(li.rate),
      amount: Number(li.amount),
      order: idx,
    }));
    taxRate = Number(job.quote.taxRate);
    discount = Number(job.quote.discount);
  } else {
    const amount = Number(job.actualCost ?? job.estimatedCost ?? 0);
    lines = [
      { description: job.title, quantity: 1, unit: 'job', rate: amount, amount, order: 0 },
    ];
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount - discount;

  // Same numbering scheme as invoice.create (global INV-NNNNNN sequence)
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastNumber = lastInvoice
    ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
    : 0;
  const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

  const issueDate = new Date();
  const invoice = await prisma.invoice.create({
    data: {
      userId: job.userId,
      companyId: job.companyId,
      customerId: job.customerId,
      locationId: job.locationId,
      invoiceNumber,
      serviceDate: job.completedAt ?? issueDate,
      issueDate,
      dueDate: calculateDueDate(issueDate, 'Net 30'),
      paymentTerms: 'Net 30',
      subtotal: new Prisma.Decimal(subtotal),
      taxRate: new Prisma.Decimal(taxRate),
      taxAmount: new Prisma.Decimal(taxAmount),
      discount: new Prisma.Decimal(discount),
      total: new Prisma.Decimal(total),
      source: 'job',
      notes: job.closeoutNotes,
      lineItems: { create: lines },
    },
  });

  await prisma.job.update({
    where: { id: job.id },
    data: { invoiceId: invoice.id },
  });

  logger.info('Auto-created invoice for closed job', {
    jobId: job.id,
    jobNumber: job.jobNumber,
    invoiceNumber,
    total,
  });
  return invoice;
}

/** Quote-level cost/margin from pricebook snapshots (lines without cost count as 0 cost). */
export function quoteMargin(quote: {
  total: Prisma.Decimal;
  lineItems: { quantity: Prisma.Decimal | number; unitCost: Prisma.Decimal | null; amount: Prisma.Decimal }[];
}) {
  const revenue = quote.lineItems.reduce((s, li) => s + Number(li.amount), 0);
  const cost = quote.lineItems.reduce(
    (s, li) => s + (li.unitCost ? Number(li.quantity) * Number(li.unitCost) : 0),
    0
  );
  return {
    revenue,
    cost,
    margin: revenue - cost,
    marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
  };
}

export type { Job };
