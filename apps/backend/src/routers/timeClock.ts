import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { JobStatus } from '@prisma/client';
import { router, protectedProcedure } from '../trpc';

/**
 * Time clock (.planning spec §3.3 + Business OS crew integration).
 * - One open entry per user, enforced server-side.
 * - totalMinutes always computed on the server.
 * - Each shift is tagged with the worker's companyId at clock-in, so every
 *   business has its own time clock (filter on /time-clock).
 * - GPS stamps recorded at punch events when the phone provides them
 *   (deliberately NOT continuous tracking).
 * - Clock-in returns the employee's MISSION: their assigned jobs for today,
 *   route-ordered.
 * - Owners/admins can correct entries (edit times, backfill a shift, delete),
 *   every change attributed via editedById/editedAt.
 */

const gpsSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

function requireAdmin(ctx: any) {
  if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Owners and admins only' });
  }
}

/** Minutes between two instants, never negative. */
function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

async function todaysMission(ctx: any, userId: string) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return ctx.prisma.job.findMany({
    where: {
      OR: [{ userId }, { assignments: { some: { userId } } }],
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
}

export const timeClockRouter = router({
  /** Punch in. Returns the new entry + today's mission (assigned jobs). */
  clockIn: protectedProcedure.input(gpsSchema).mutation(async ({ ctx, input }) => {
    const open = await ctx.prisma.timeEntry.findFirst({
      where: { userId: ctx.userId, clockOut: null },
    });
    if (open) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already clocked in — clock out first' });
    }
    const entry = await ctx.prisma.timeEntry.create({
      data: {
        userId: ctx.userId,
        companyId: ctx.user.companyId, // tag the shift to the worker's business
        clockIn: new Date(),
        clockInLat: input.lat,
        clockInLng: input.lng,
      },
    });
    const mission = await todaysMission(ctx, ctx.userId);
    return { entry, mission };
  }),

  /** Punch out. Server computes totalMinutes. */
  clockOut: protectedProcedure
    .input(gpsSchema.extend({ notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const open = await ctx.prisma.timeEntry.findFirst({
        where: { userId: ctx.userId, clockOut: null },
        orderBy: { clockIn: 'desc' },
      });
      if (!open) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not clocked in' });
      }
      const clockOut = new Date();
      return ctx.prisma.timeEntry.update({
        where: { id: open.id },
        data: {
          clockOut,
          totalMinutes: minutesBetween(open.clockIn, clockOut),
          notes: input.notes,
          clockOutLat: input.lat,
          clockOutLng: input.lng,
        },
      });
    }),

  /** Current punch state + today's worked minutes + today's mission. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [open, todayEntries, mission] = await Promise.all([
      ctx.prisma.timeEntry.findFirst({ where: { userId: ctx.userId, clockOut: null } }),
      ctx.prisma.timeEntry.findMany({
        where: { userId: ctx.userId, clockIn: { gte: dayStart } },
      }),
      todaysMission(ctx, ctx.userId),
    ]);
    const closedMinutes = todayEntries.reduce((s, e) => s + (e.totalMinutes ?? 0), 0);
    const openMinutes = open ? minutesBetween(open.clockIn, new Date()) : 0;
    return {
      clockedIn: !!open,
      openEntry: open,
      todayMinutes: closedMinutes + openMinutes,
      mission,
    };
  }),

  /** My recent entries (for the employee's own log). */
  myEntries: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(14) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 86400000);
      return ctx.prisma.timeEntry.findMany({
        where: { userId: ctx.userId, clockIn: { gte: since } },
        orderBy: { clockIn: 'desc' },
      });
    }),

  /**
   * Live team panel + week totals — OWNER/ADMIN only.
   * Optional companyId restricts to one business's crew (each business its
   * own clock); omitted = everyone across the holding.
   */
  teamStatus: protectedProcedure
    .input(z.object({ companyId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);

      const companyId = input?.companyId;
      const users = await ctx.prisma.user.findMany({
        where: { active: true, ...(companyId ? { companyId } : {}) },
        select: { id: true, name: true, role: true, companyId: true },
      });
      const entries = await ctx.prisma.timeEntry.findMany({
        where: { clockIn: { gte: weekStart }, ...(companyId ? { companyId } : {}) },
      });
      return users.map((u) => {
        const mine = entries.filter((e) => e.userId === u.id);
        const open = mine.find((e) => !e.clockOut);
        const weekMinutes =
          mine.reduce((s, e) => s + (e.totalMinutes ?? 0), 0) +
          (open ? minutesBetween(open.clockIn, new Date()) : 0);
        return {
          userId: u.id,
          name: u.name,
          role: u.role,
          companyId: u.companyId,
          clockedIn: !!open,
          since: open?.clockIn ?? null,
          weekMinutes,
          lastGps: open?.clockInLat != null ? { lat: Number(open.clockInLat), lng: Number(open.clockInLng) } : null,
        };
      });
    }),

  /**
   * Individual entries for the admin edit table — OWNER/ADMIN only.
   * Filter by company and/or a date window; defaults to the last 14 days.
   */
  entries: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        userId: z.string().optional(),
        days: z.number().int().min(1).max(180).default(14),
      })
    )
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const since = new Date(Date.now() - input.days * 86400000);
      const rows = await ctx.prisma.timeEntry.findMany({
        where: {
          clockIn: { gte: since },
          ...(input.companyId ? { companyId: input.companyId } : {}),
          ...(input.userId ? { userId: input.userId } : {}),
        },
        include: {
          user: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          editedBy: { select: { id: true, name: true } },
        },
        orderBy: { clockIn: 'desc' },
      });
      return rows.map((e) => ({
        id: e.id,
        userId: e.userId,
        userName: e.user.name,
        companyId: e.companyId,
        companyName: e.company?.name ?? null,
        clockIn: e.clockIn,
        clockOut: e.clockOut,
        totalMinutes: e.totalMinutes,
        notes: e.notes,
        open: !e.clockOut,
        editedByName: e.editedBy?.name ?? null,
        editedAt: e.editedAt,
      }));
    }),

  /**
   * Correct an entry — OWNER/ADMIN only. Edit clock-in/out and/or notes;
   * totalMinutes is recomputed; the edit is attributed to the admin.
   */
  adjustEntry: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        clockIn: z.coerce.date().optional(),
        clockOut: z.coerce.date().nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const existing = await ctx.prisma.timeEntry.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });

      const clockIn = input.clockIn ?? existing.clockIn;
      // clockOut: undefined = leave as-is; null = reopen the entry; date = set.
      const clockOut =
        input.clockOut === undefined ? existing.clockOut : input.clockOut;

      if (clockOut && clockOut < clockIn) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Clock-out must be after clock-in' });
      }

      return ctx.prisma.timeEntry.update({
        where: { id: input.id },
        data: {
          clockIn,
          clockOut,
          totalMinutes: clockOut ? minutesBetween(clockIn, clockOut) : null,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          editedById: ctx.userId,
          editedAt: new Date(),
        },
      });
    }),

  /**
   * Backfill a shift someone forgot to punch — OWNER/ADMIN only.
   * companyId is taken from the target user so the shift lands on the right
   * business's clock.
   */
  createManualEntry: protectedProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        clockIn: z.coerce.date(),
        clockOut: z.coerce.date().optional(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const target = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, companyId: true },
      });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if (input.clockOut && input.clockOut < input.clockIn) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Clock-out must be after clock-in' });
      }
      return ctx.prisma.timeEntry.create({
        data: {
          userId: target.id,
          companyId: target.companyId,
          clockIn: input.clockIn,
          clockOut: input.clockOut,
          totalMinutes: input.clockOut ? minutesBetween(input.clockIn, input.clockOut) : null,
          notes: input.notes,
          editedById: ctx.userId,
          editedAt: new Date(),
        },
      });
    }),

  /** Remove an entry — OWNER/ADMIN only. */
  deleteEntry: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const existing = await ctx.prisma.timeEntry.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      await ctx.prisma.timeEntry.delete({ where: { id: input.id } });
      return { id: input.id, deleted: true };
    }),
});
