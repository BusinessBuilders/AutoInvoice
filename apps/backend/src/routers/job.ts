import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { JobStatus } from '@prisma/client';
import { router, protectedProcedure } from '../trpc';
import { assertTransition, createInvoiceForJob, nextJobNumber } from '../services/jobs';

/**
 * Field-service jobs (spec §3.4): Request → Schedule → In progress →
 * Closeout → auto-Invoice. Day view powers the crew packet/route.
 */

const checklistSchema = z.array(
  z.object({
    item: z.string(),
    done: z.boolean().default(false),
    doneAt: z.coerce.date().optional(),
    by: z.string().optional(),
  })
);

async function ownedJob(ctx: any, id: string) {
  const job = await ctx.prisma.job.findFirst({ where: { id, userId: ctx.userId } });
  if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
  return job;
}

// Owner sees everything; assigned crew see (and can work) their jobs.
// Financial/scheduling actions (create, schedule, close, cancel, crew mgmt)
// stay owner-only via ownedJob.
function visibleJobsWhere(ctx: any) {
  return {
    OR: [
      { userId: ctx.userId },
      { assignments: { some: { userId: ctx.userId } } },
    ],
  };
}

async function workableJob(ctx: any, id: string) {
  const job = await ctx.prisma.job.findFirst({
    where: { id, ...visibleJobsWhere(ctx) },
  });
  if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
  return job;
}

async function logJobActivity(ctx: any, job: any, body: string) {
  // Status history is visible on the customer timeline (spec §4)
  await ctx.prisma.activity.create({
    data: {
      userId: ctx.userId,
      companyId: job.companyId,
      customerId: job.customerId,
      type: 'SYSTEM',
      body,
      source: 'system',
      metadata: { jobId: job.id, jobNumber: job.jobNumber },
    },
  });
}

export const jobRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        customerId: z.string(),
        locationId: z.string().optional(),
        quoteId: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        scheduledStart: z.coerce.date().optional(),
        scheduledEnd: z.coerce.date().optional(),
        estimatedCost: z.number().optional(),
        checklist: checklistSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.userId },
      });
      if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      const customer = await ctx.prisma.customer.findFirst({
        where: { id: input.customerId, userId: ctx.userId },
      });
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      if (input.quoteId) {
        const quote = await ctx.prisma.quote.findFirst({
          where: { id: input.quoteId, userId: ctx.userId },
        });
        if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
      }

      const job = await ctx.prisma.job.create({
        data: {
          userId: ctx.userId,
          companyId: input.companyId,
          customerId: input.customerId,
          locationId: input.locationId,
          quoteId: input.quoteId,
          jobNumber: await nextJobNumber(ctx.userId),
          title: input.title,
          description: input.description,
          estimatedCost: input.estimatedCost,
          checklist: input.checklist,
          status: input.scheduledStart ? JobStatus.SCHEDULED : JobStatus.REQUESTED,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
        },
      });
      await logJobActivity(ctx, job, `Job ${job.jobNumber} created (${job.status})`);
      return job;
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const job = await ctx.prisma.job.findFirst({
      where: { id: input.id, ...visibleJobsWhere(ctx) },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        location: true,
        quote: { include: { lineItems: true } },
        invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
        assignments: { include: { user: { select: { id: true, name: true } } } },
        photos: { select: { id: true, imageUrl: true, caption: true, phase: true, takenAt: true } },
      },
    });
    if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
    return job;
  }),

  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        customerId: z.string().optional(),
        status: z.nativeEnum(JobStatus).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.job.findMany({
        where: {
          ...visibleJobsWhere(ctx),
          companyId: input.companyId,
          customerId: input.customerId,
          status: input.status,
          scheduledStart: input.from || input.to ? { gte: input.from, lte: input.to } : undefined,
        },
        include: {
          customer: { select: { id: true, name: true } },
          assignments: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) nextCursor = items.pop()!.id;
      return { items, nextCursor };
    }),

  /** Route/day view — the crew packet (spec §3.4). */
  dayView: protectedProcedure
    .input(z.object({ date: z.coerce.date(), companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const dayStart = new Date(input.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const jobs = await ctx.prisma.job.findMany({
        where: {
          ...visibleJobsWhere(ctx),
          companyId: input.companyId,
          scheduledStart: { gte: dayStart, lt: dayEnd },
          status: { in: [JobStatus.SCHEDULED, JobStatus.IN_PROGRESS, JobStatus.COMPLETED] },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, notes: true } },
          location: true,
          assignments: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: [{ routeOrder: { sort: 'asc', nulls: 'last' } }, { scheduledStart: 'asc' }],
      });
      return jobs;
    }),

  /** Job counts per day for a week — the schedule strip on the day view. */
  weekOverview: protectedProcedure
    .input(z.object({ start: z.coerce.date(), companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const weekStart = new Date(input.start);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const jobs = await ctx.prisma.job.findMany({
        where: {
          ...visibleJobsWhere(ctx),
          companyId: input.companyId,
          scheduledStart: { gte: weekStart, lt: weekEnd },
          status: { in: [JobStatus.SCHEDULED, JobStatus.IN_PROGRESS, JobStatus.COMPLETED, JobStatus.CLOSED] },
        },
        select: { scheduledStart: true, status: true },
      });
      const days: { date: string; total: number; done: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const dayJobs = jobs.filter(
          (j) => j.scheduledStart && j.scheduledStart.toDateString() === d.toDateString()
        );
        days.push({
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          total: dayJobs.length,
          done: dayJobs.filter((j) => j.status === JobStatus.COMPLETED || j.status === JobStatus.CLOSED).length,
        });
      }
      return days;
    }),

  schedule: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        scheduledStart: z.coerce.date(),
        scheduledEnd: z.coerce.date().optional(),
        routeOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ownedJob(ctx, input.id);
      if (job.status !== JobStatus.SCHEDULED) assertTransition(job.status, JobStatus.SCHEDULED);
      const updated = await ctx.prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.SCHEDULED,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          routeOrder: input.routeOrder,
        },
      });
      await logJobActivity(ctx, updated, `Job ${job.jobNumber} scheduled for ${input.scheduledStart.toISOString().slice(0, 10)}`);
      return updated;
    }),

  start: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const job = await workableJob(ctx, input.id);
    assertTransition(job.status, JobStatus.IN_PROGRESS);
    const updated = await ctx.prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.IN_PROGRESS },
    });
    await logJobActivity(ctx, updated, `Job ${job.jobNumber} started`);
    return updated;
  }),

  /** Closeout: checklist, notes, photos already attached via addPhoto. */
  complete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        closeoutNotes: z.string().optional(),
        customerNotes: z.string().optional(),
        checklist: checklistSchema.optional(),
        actualCost: z.number().optional(),
        // GPS stamp from the crew phone at completion (spec: punch-event
        // stamps, not continuous tracking)
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await workableJob(ctx, input.id);
      assertTransition(job.status, JobStatus.COMPLETED);
      const updated = await ctx.prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          closeoutNotes: input.closeoutNotes,
          customerNotes: input.customerNotes,
          checklist: input.checklist,
          actualCost: input.actualCost,
        },
      });
      await ctx.prisma.activity.create({
        data: {
          userId: ctx.userId,
          companyId: updated.companyId,
          customerId: updated.customerId,
          type: 'SYSTEM',
          body: `Job ${job.jobNumber} completed`,
          source: 'system',
          metadata: {
            jobId: updated.id,
            jobNumber: updated.jobNumber,
            ...(input.lat != null && input.lng != null
              ? { completedAt: { lat: input.lat, lng: input.lng } }
              : {}),
          },
        },
      });
      return updated;
    }),

  /** CLOSED auto-creates the invoice (spec §3.4 state machine). */
  close: protectedProcedure
    .input(z.object({ id: z.string(), skipInvoice: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const job = await ownedJob(ctx, input.id);
      assertTransition(job.status, JobStatus.CLOSED);

      let invoice = null;
      if (!input.skipInvoice) {
        invoice = await createInvoiceForJob(job.id);
      }
      const updated = await ctx.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.CLOSED },
      });
      await logJobActivity(
        ctx,
        updated,
        `Job ${job.jobNumber} closed${invoice ? ` — invoice ${invoice.invoiceNumber} created` : ''}`
      );
      return { job: updated, invoice };
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ownedJob(ctx, input.id);
      assertTransition(job.status, JobStatus.CANCELLED);
      const updated = await ctx.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.CANCELLED },
      });
      await logJobActivity(ctx, updated, `Job ${job.jobNumber} cancelled${input.reason ? `: ${input.reason}` : ''}`);
      return updated;
    }),

  assignCrew: protectedProcedure
    .input(z.object({ jobId: z.string(), userId: z.string(), role: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await ownedJob(ctx, input.jobId);
      return ctx.prisma.jobAssignment.upsert({
        where: { jobId_userId: { jobId: input.jobId, userId: input.userId } },
        update: { role: input.role },
        create: { jobId: input.jobId, userId: input.userId, role: input.role },
      });
    }),

  removeCrew: protectedProcedure
    .input(z.object({ jobId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ownedJob(ctx, input.jobId);
      await ctx.prisma.jobAssignment.delete({
        where: { jobId_userId: { jobId: input.jobId, userId: input.userId } },
      });
      return { ok: true };
    }),

  addPhoto: protectedProcedure
    .input(
      z.object({
        jobId: z.string(),
        imageUrl: z.string().optional(),
        imageData: z.string().optional(), // base64
        caption: z.string().optional(),
        phase: z.enum(['before', 'during', 'after']).default('after'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await workableJob(ctx, input.jobId);
      if (!input.imageUrl && !input.imageData) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'imageUrl or imageData required' });
      }
      return ctx.prisma.jobPhoto.create({
        data: {
          jobId: input.jobId,
          imageUrl: input.imageUrl,
          imageData: input.imageData ? Buffer.from(input.imageData, 'base64') : undefined,
          caption: input.caption,
          phase: input.phase,
        },
      });
    }),
});
