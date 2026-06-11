import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { JobStatus } from '@prisma/client';
import { router, protectedProcedure } from '../trpc';

/**
 * Time clock (.planning spec §3.3 + Business OS crew integration).
 * - One open entry per user, enforced server-side.
 * - totalMinutes always computed on the server.
 * - GPS stamps recorded at punch events when the phone provides them
 *   (deliberately NOT continuous tracking).
 * - Clock-in returns the employee's MISSION: their assigned jobs for today,
 *   route-ordered.
 */

const gpsSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

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
          totalMinutes: Math.round((clockOut.getTime() - open.clockIn.getTime()) / 60000),
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
    const openMinutes = open ? Math.round((Date.now() - open.clockIn.getTime()) / 60000) : 0;
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

  /** Live team panel + week totals — OWNER/ADMIN only. */
  teamStatus: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'ADMIN') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Owners and admins only' });
    }
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    const users = await ctx.prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
    });
    const entries = await ctx.prisma.timeEntry.findMany({
      where: { clockIn: { gte: weekStart } },
    });
    return users.map((u) => {
      const mine = entries.filter((e) => e.userId === u.id);
      const open = mine.find((e) => !e.clockOut);
      const weekMinutes =
        mine.reduce((s, e) => s + (e.totalMinutes ?? 0), 0) +
        (open ? Math.round((Date.now() - open.clockIn.getTime()) / 60000) : 0);
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        clockedIn: !!open,
        since: open?.clockIn ?? null,
        weekMinutes,
        lastGps: open?.clockInLat != null ? { lat: Number(open.clockInLat), lng: Number(open.clockInLng) } : null,
      };
    });
  }),
});
