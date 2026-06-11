import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { timeClockRouter } from '../../routers/timeClock';
import { authRouter } from '../../routers/auth';
import { jobRouter } from '../../routers/job';

const prisma = new PrismaClient();

describe('Time clock + crew signup', () => {
  let ownerId: string;
  let crewId: string;
  let companyId: string;
  let customerId: string;

  const ctxFor = (userId: string) => ({ req: {} as any, res: {} as any, userId, prisma }) as any;

  beforeEach(async () => {
    await (prisma as any).timeEntry.deleteMany();
    const owner = await prisma.user.create({
      data: { email: 'tc-owner@test.com', password: 'x', name: 'Owner', role: 'OWNER' },
    });
    ownerId = owner.id;
    const crew = await prisma.user.create({
      data: { email: 'tc-crew@test.com', password: 'x', name: 'Crew', role: 'EMPLOYEE' },
    });
    crewId = crew.id;
    companyId = (await prisma.company.create({ data: { userId: ownerId, name: 'TC Co' } })).id;
    customerId = (
      await prisma.customer.create({ data: { userId: ownerId, name: 'TC Customer' } })
    ).id;
  });

  it('clock-in returns the mission (assigned jobs today), enforces one open entry, clock-out computes minutes', async () => {
    const ownerJobs = jobRouter.createCaller(ctxFor(ownerId));
    const today9 = new Date();
    today9.setHours(9, 0, 0, 0);
    const job = await ownerJobs.create({
      companyId, customerId, title: 'Morning mow', scheduledStart: today9,
    });
    await ownerJobs.assignCrew({ jobId: job.id, userId: crewId, role: 'lead' });

    const clock = timeClockRouter.createCaller(ctxFor(crewId));
    const { entry, mission } = await clock.clockIn({ lat: 42.1, lng: -71.9 });
    expect(entry.clockOut).toBeNull();
    expect(Number(entry.clockInLat)).toBeCloseTo(42.1);
    expect(mission).toHaveLength(1);
    expect(mission[0].title).toBe('Morning mow');
    expect(mission[0].customer.name).toBe('TC Customer');

    // double clock-in rejected
    await expect(clock.clockIn({})).rejects.toThrow(/Already clocked in/);

    // status reflects open entry + mission
    const status = await clock.status();
    expect(status.clockedIn).toBe(true);
    expect(status.mission).toHaveLength(1);

    const closed = await clock.clockOut({ lat: 42.2, lng: -71.8, notes: 'done for the day' });
    expect(closed.totalMinutes).toBeGreaterThanOrEqual(0);
    expect(closed.notes).toBe('done for the day');
    expect(Number(closed.clockOutLat)).toBeCloseTo(42.2);

    await expect(clock.clockOut({})).rejects.toThrow(/Not clocked in/);
  });

  it('teamStatus is owner/admin only and shows live punches', async () => {
    const crewClock = timeClockRouter.createCaller(ctxFor(crewId));
    await crewClock.clockIn({ lat: 42.0, lng: -71.5 });

    await expect(crewClock.teamStatus()).rejects.toThrow(/Owners and admins only/);

    const ownerClock = timeClockRouter.createCaller(ctxFor(ownerId));
    const team = await ownerClock.teamStatus();
    const crewRow = team.find((t) => t.userId === crewId);
    expect(crewRow!.clockedIn).toBe(true);
    expect(crewRow!.lastGps).toEqual({ lat: 42, lng: -71.5 });
  });

  it('crew completes a job with a GPS stamp recorded on the timeline', async () => {
    const ownerJobs = jobRouter.createCaller(ctxFor(ownerId));
    const job = await ownerJobs.create({
      companyId, customerId, title: 'Stamped job', scheduledStart: new Date(),
    });
    await ownerJobs.assignCrew({ jobId: job.id, userId: crewId });

    const crewJobs = jobRouter.createCaller(ctxFor(crewId));
    await crewJobs.start({ id: job.id });
    await crewJobs.complete({ id: job.id, lat: 42.34, lng: -71.99 });

    const activity = await prisma.activity.findFirst({
      where: { body: { contains: 'completed' }, customerId },
    });
    expect((activity!.metadata as any).completedAt).toEqual({ lat: 42.34, lng: -71.99 });
  });

  it('registerEmployee requires the right invite code and creates an EMPLOYEE', async () => {
    const auth = authRouter.createCaller(ctxFor(null as any));
    process.env.CREW_SIGNUP_CODE = 'test-crew-code';

    await expect(
      auth.registerEmployee({
        name: 'New Crew', email: 'newcrew@test.com', password: 'secret1', inviteCode: 'wrong',
      })
    ).rejects.toThrow(/Invalid invite code/);

    const res = await auth.registerEmployee({
      name: 'New Crew', email: 'newcrew@test.com', password: 'secret1', inviteCode: 'test-crew-code',
    });
    expect(res.user.role).toBe('EMPLOYEE');
    expect(res.accessToken).toBeTruthy();

    delete process.env.CREW_SIGNUP_CODE;
    await expect(
      auth.registerEmployee({
        name: 'X', email: 'x@test.com', password: 'secret1', inviteCode: 'anything',
      })
    ).rejects.toThrow(/not enabled/);
  });
});
