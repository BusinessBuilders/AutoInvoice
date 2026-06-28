import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { timeClockRouter } from '../../routers/timeClock';
import { authRouter } from '../../routers/auth';
import { companyRouter } from '../../routers/company';
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
    // Company before crew so the crew member can belong to it.
    companyId = (await prisma.company.create({ data: { userId: ownerId, name: 'TC Co' } })).id;
    const crew = await prisma.user.create({
      data: { email: 'tc-crew@test.com', password: 'x', name: 'Crew', role: 'EMPLOYEE', companyId },
    });
    crewId = crew.id;
    customerId = (
      await prisma.customer.create({ data: { userId: ownerId, name: 'TC Customer' } })
    ).id;
  });

  it('clock-in returns the mission (assigned jobs today), tags the company, enforces one open entry, clock-out computes minutes', async () => {
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
    expect(entry.companyId).toBe(companyId); // shift tagged to the worker's business
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

  it('teamStatus is owner/admin only, shows live punches, and filters by company', async () => {
    const crewClock = timeClockRouter.createCaller(ctxFor(crewId));
    await crewClock.clockIn({ lat: 42.0, lng: -71.5 });

    await expect(crewClock.teamStatus()).rejects.toThrow(/Owners and admins only/);

    // A second business with its own crew member, clocked in.
    const otherCo = await prisma.company.create({ data: { userId: ownerId, name: 'Other Co' } });
    const otherCrew = await prisma.user.create({
      data: { email: 'tc-other@test.com', password: 'x', name: 'Other Crew', role: 'EMPLOYEE', companyId: otherCo.id },
    });
    await timeClockRouter.createCaller(ctxFor(otherCrew.id)).clockIn({});

    const ownerClock = timeClockRouter.createCaller(ctxFor(ownerId));

    // Unfiltered: both businesses' crew appear.
    const all = await ownerClock.teamStatus();
    expect(all.find((t) => t.userId === crewId)?.clockedIn).toBe(true);
    expect(all.find((t) => t.userId === otherCrew.id)?.clockedIn).toBe(true);

    // Filtered: only the requested business's crew.
    const justTcCo = await ownerClock.teamStatus({ companyId });
    expect(justTcCo.map((t) => t.userId)).toContain(crewId);
    expect(justTcCo.map((t) => t.userId)).not.toContain(otherCrew.id);
    const tcRow = justTcCo.find((t) => t.userId === crewId)!;
    expect(tcRow.companyId).toBe(companyId);
    expect(tcRow.lastGps).toEqual({ lat: 42, lng: -71.5 });
  });

  it('admin can adjust, backfill, and delete entries — with audit and validation; crew cannot', async () => {
    const owner = timeClockRouter.createCaller(ctxFor(ownerId));
    const crew = timeClockRouter.createCaller(ctxFor(crewId));

    // Crew is locked out of every admin tool.
    await expect(crew.entries({})).rejects.toThrow(/Owners and admins only/);
    await expect(crew.adjustEntry({ id: 'x' })).rejects.toThrow(/Owners and admins only/);
    await expect(crew.createManualEntry({ userId: crewId, clockIn: new Date() })).rejects.toThrow(/Owners and admins only/);
    await expect(crew.deleteEntry({ id: 'x' })).rejects.toThrow(/Owners and admins only/);

    // Backfill a forgotten shift: company comes from the target user.
    const inAt = new Date('2026-06-10T13:00:00.000Z');
    const outAt = new Date('2026-06-10T17:30:00.000Z');
    const manual = await owner.createManualEntry({
      userId: crewId, clockIn: inAt, clockOut: outAt, notes: 'forgot to punch',
    });
    expect(manual.companyId).toBe(companyId);
    expect(manual.totalMinutes).toBe(270); // 4h30m
    expect(manual.editedById).toBe(ownerId);
    expect(manual.editedAt).not.toBeNull();

    // Backfill validation: clock-out before clock-in is rejected.
    await expect(
      owner.createManualEntry({ userId: crewId, clockIn: outAt, clockOut: inAt })
    ).rejects.toThrow(/after clock-in/);

    // Adjust recomputes minutes and stamps the editor.
    const adjusted = await owner.adjustEntry({
      id: manual.id,
      clockOut: new Date('2026-06-10T18:00:00.000Z'),
    });
    expect(adjusted.totalMinutes).toBe(300); // now 5h
    expect(adjusted.editedById).toBe(ownerId);

    // Adjust validation.
    await expect(
      owner.adjustEntry({ id: manual.id, clockIn: new Date('2026-06-11T00:00:00.000Z') })
    ).rejects.toThrow(/after clock-in/);

    // Reopen by clearing clock-out (null) → minutes go null.
    const reopened = await owner.adjustEntry({ id: manual.id, clockOut: null });
    expect(reopened.clockOut).toBeNull();
    expect(reopened.totalMinutes).toBeNull();

    // entries() returns the row with joined names for the admin table.
    const rows = await owner.entries({ companyId });
    const row = rows.find((r) => r.id === manual.id)!;
    expect(row.userName).toBe('Crew');
    expect(row.companyName).toBe('TC Co');
    expect(row.editedByName).toBe('Owner');

    // Delete.
    const del = await owner.deleteEntry({ id: manual.id });
    expect(del.deleted).toBe(true);
    await expect(owner.adjustEntry({ id: manual.id })).rejects.toThrow(/not found/i);
  });

  it('registerEmployee routes the new hire to the business their invite code maps to', async () => {
    const auth = authRouter.createCaller(ctxFor(null as any));

    // Per-business code on the Company.
    await prisma.company.update({ where: { id: companyId }, data: { crewSignupCode: 'tcco-crew-abc123' } });

    await expect(
      auth.registerEmployee({ name: 'New Crew', email: 'newcrew@test.com', password: 'secret1', inviteCode: 'wrong' })
    ).rejects.toThrow(/Invalid invite code/);

    const res = await auth.registerEmployee({
      name: 'New Crew', email: 'newcrew@test.com', password: 'secret1', inviteCode: 'tcco-crew-abc123',
    });
    expect(res.user.role).toBe('EMPLOYEE');
    expect(res.company).toEqual({ id: companyId, name: 'TC Co' });
    expect(res.accessToken).toBeTruthy();
    const created = await prisma.user.findUnique({ where: { id: res.user.id } });
    expect(created!.companyId).toBe(companyId); // joined the right business
  });

  it('registerEmployee honors the legacy env code via CREW_DEFAULT_COMPANY_ID fallback', async () => {
    const auth = authRouter.createCaller(ctxFor(null as any));
    process.env.CREW_SIGNUP_CODE = 'legacy-code';
    process.env.CREW_DEFAULT_COMPANY_ID = companyId;
    try {
      const res = await auth.registerEmployee({
        name: 'Legacy Hire', email: 'legacy@test.com', password: 'secret1', inviteCode: 'legacy-code',
      });
      expect(res.company.id).toBe(companyId);
      const created = await prisma.user.findUnique({ where: { id: res.user.id } });
      expect(created!.companyId).toBe(companyId);
    } finally {
      delete process.env.CREW_SIGNUP_CODE;
      delete process.env.CREW_DEFAULT_COMPANY_ID;
    }

    // With no company code and no env code, any code is rejected.
    await expect(
      auth.registerEmployee({ name: 'X', email: 'x@test.com', password: 'secret1', inviteCode: 'anything' })
    ).rejects.toThrow(/Invalid invite code/);
  });

  it('company.crewCodes + regenerateCrewCode are admin-only and produce a usable code', async () => {
    const ownerCo = companyRouter.createCaller(ctxFor(ownerId));
    const crewCo = companyRouter.createCaller(ctxFor(crewId));

    await expect(crewCo.crewCodes()).rejects.toThrow(/Owners and admins only/);
    await expect(crewCo.regenerateCrewCode({ companyId })).rejects.toThrow(/Owners and admins only/);

    const updated = await ownerCo.regenerateCrewCode({ companyId });
    expect(updated.crewSignupCode).toMatch(/^tc-co-crew-[0-9a-f]{8}$/);

    const codes = await ownerCo.crewCodes();
    expect(codes.find((c) => c.id === companyId)?.crewSignupCode).toBe(updated.crewSignupCode);

    // The generated code actually works for signup and routes to the company.
    const auth = authRouter.createCaller(ctxFor(null as any));
    const res = await auth.registerEmployee({
      name: 'Code Hire', email: 'codehire@test.com', password: 'secret1', inviteCode: updated.crewSignupCode!,
    });
    expect(res.company.id).toBe(companyId);
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
});
