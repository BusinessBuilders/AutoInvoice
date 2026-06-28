import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { adSpendRouter } from '../../routers/adSpend';
import { leadRouter } from '../../routers/lead';
import { ingestOrder } from '../../services/commerce/ingest-order';

const prisma = new PrismaClient();

describe('Business OS Phase 5 — attribution (first-touch)', () => {
  let userId: string;
  let companyId: string;

  const ctx = () => ({ req: {} as any, res: {} as any, userId, prisma }) as any;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: 'attr@test.com', password: 'x', name: 'Attr Test' },
    });
    userId = user.id;
    companyId = (await prisma.company.create({ data: { userId, name: 'Ads Co' } })).id;
    await prisma.ingestSource.create({
      data: { userId, companyId, key: 'ads-shop', name: 'Shop', kind: 'custom', secret: 's' },
    });
  });

  const paidOrder = (externalId: string, email: string, campaign: string, total: number) => ({
    version: '1',
    event: 'order.paid',
    order: {
      external_id: externalId,
      placed_at: '2026-06-05T12:00:00Z',
      customer: { email, name: email.split('@')[0] },
      items: [{ sku: 'X', name: 'Thing', quantity: 1, unit_price: String(total) }],
      totals: { subtotal: String(total), tax: '0', shipping: '0', discount: '0', total: String(total) },
      attribution: { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: campaign },
    },
  });

  it('order-created customers get first-touch snapshot; revenue events carry attribution', async () => {
    await ingestOrder('ads-shop', paidOrder('o1', 'a@x.com', 'spring-lawn', 100));
    const customer = await prisma.customer.findFirst({ where: { email: 'a@x.com' } });
    expect(customer!.acquisitionSource).toBe('facebook');
    expect(customer!.acquisitionCampaign).toBe('spring-lawn');
    expect(customer!.firstTouchAt!.toISOString()).toBe('2026-06-05T12:00:00.000Z');

    const event = await prisma.revenueEvent.findFirst();
    expect(event!.attributionSource).toBe('facebook');
    expect(event!.attributionCampaign).toBe('spring-lawn');
  });

  it('first touch is never overwritten by later orders', async () => {
    await ingestOrder('ads-shop', paidOrder('o1', 'a@x.com', 'spring-lawn', 100));
    const repeat = paidOrder('o2', 'a@x.com', 'different-campaign', 50);
    repeat.order.attribution.utm_source = 'google';
    await ingestOrder('ads-shop', repeat);

    const customer = await prisma.customer.findFirst({ where: { email: 'a@x.com' } });
    expect(customer!.acquisitionSource).toBe('facebook'); // first touch wins
    expect(customer!.acquisitionCampaign).toBe('spring-lawn');
    expect(await prisma.customer.count()).toBe(1);
  });

  it('lead with UTM converts to customer carrying the snapshot', async () => {
    const leads = leadRouter.createCaller(ctx());
    const lead = await leads.create({
      name: 'Ad Lead', phone: '+15551112222', source: 'web',
      utmSource: 'google', utmCampaign: 'hydro-search', companyId,
    });
    const converted = await leads.convertToCustomer({ leadId: lead.id });
    const customer = await prisma.customer.findFirst({
      where: { id: (converted as any).customer?.id ?? (converted as any).id ?? undefined },
    });
    const c = customer ?? (await prisma.customer.findFirst({ where: { name: 'Ad Lead' } }));
    expect(c!.acquisitionSource).toBe('google');
    expect(c!.acquisitionCampaign).toBe('hydro-search');
    expect(c!.firstTouchAt).not.toBeNull();
  });

  it('CAC, ROAS and LTV math against hand-computed fixtures', async () => {
    const ads = adSpendRouter.createCaller(ctx());
    // June: facebook spend 200 across two days on campaign spring-lawn
    await ads.record({ companyId, date: new Date('2026-06-01'), channel: 'facebook', campaign: 'spring-lawn', spend: 120, clicks: 300 });
    await ads.record({ companyId, date: new Date('2026-06-03'), channel: 'facebook', campaign: 'spring-lawn', spend: 80, clicks: 150 });
    // re-import corrects, not duplicates
    await ads.record({ companyId, date: new Date('2026-06-03'), channel: 'facebook', campaign: 'spring-lawn', spend: 80, clicks: 150 });

    // two new facebook customers in June, revenue 100 + 50
    await ingestOrder('ads-shop', paidOrder('o1', 'a@x.com', 'spring-lawn', 100));
    await ingestOrder('ads-shop', paidOrder('o2', 'b@x.com', 'spring-lawn', 50));

    const report = await ads.report({
      companyId,
      from: new Date('2026-06-01'),
      to: new Date('2026-06-30'),
    });
    expect(report.channels).toHaveLength(1);
    const fb = report.channels[0];
    expect(fb.channel).toBe('facebook');
    expect(fb.spend).toBe(200);
    expect(fb.newCustomers).toBe(2);
    expect(fb.cac).toBe(100);             // 200 / 2
    expect(fb.attributedRevenue).toBe(150);
    expect(fb.roas).toBeCloseTo(0.75);    // 150 / 200

    const campaign = report.campaigns.find((c) => c.campaign === 'spring-lawn');
    expect(campaign!.roas).toBeCloseTo(0.75);

    const ltv = await ads.ltv({ companyId });
    expect(ltv[0].ltv).toBe(100);
    expect(ltv[1].ltv).toBe(50);
    expect(ltv[0].acquisitionSource).toBe('facebook');
  });
});
