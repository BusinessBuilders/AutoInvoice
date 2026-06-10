import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { PrismaClient, JobStatus, SubscriptionStatus } from '@prisma/client';
import { Pool } from 'pg';
import { runAutomations } from '../../services/automations';
import { ingestOrder } from '../../services/commerce/ingest-order';
import { recordRenewal } from '../../services/subscriptions';

// MCP handlers (pool injected — same SQL the live MCP server runs)
import { createLeadHandler } from '../../../../../packages/mcp/src/tools/create_lead';
import { logActivityHandler } from '../../../../../packages/mcp/src/tools/log_activity';
import { getCustomer360Handler } from '../../../../../packages/mcp/src/tools/get_customer_360';
import {
  getMrrHandler,
  getPipelineHandler,
  listAgingQuotesHandler,
  getRevenueSummaryHandler,
  listJobsTodayHandler,
} from '../../../../../packages/mcp/src/tools/business_os_reports';

const prisma = new PrismaClient();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

afterAll(async () => {
  await pool.end();
});

describe('Business OS Phase 6 — automations, views, MCP tools', () => {
  let userId: string;
  let companyId: string;
  let customerId: string;

  beforeEach(async () => {
    await (prisma as any).automationLog.deleteMany();
    const user = await prisma.user.create({
      data: { email: 'p6@test.com', password: 'x', name: 'P6', role: 'OWNER' },
    });
    userId = user.id;
    companyId = (await prisma.company.create({ data: { userId, name: 'P6 Co' } })).id;
    customerId = (
      await prisma.customer.create({ data: { userId, name: 'P6 Customer', primaryCompanyId: companyId } })
    ).id;
  });

  describe('automations', () => {
    it('aging quote nudge fires exactly once', async () => {
      const old = new Date(Date.now() - 10 * 86400000);
      await prisma.quote.create({
        data: {
          quoteNumber: 'Q-AGED', userId, customerId, companyId, projectType: 'hydroseed',
          subtotal: 100, total: 100, validUntil: new Date(), status: 'SENT', sentAt: old,
        },
      });
      const first = await runAutomations();
      expect(first.filter((f) => f.rule === 'aging_quote_nudge')).toHaveLength(1);
      const second = await runAutomations();
      expect(second.filter((f) => f.rule === 'aging_quote_nudge')).toHaveLength(0);

      const task = await prisma.task.findFirst({ where: { title: { contains: 'Q-AGED' } } });
      expect(task).not.toBeNull();
      const activity = await prisma.activity.findFirst({ where: { source: 'automation' } });
      expect(activity).not.toBeNull();
    });

    it('post-job review, renewal reminder, dunning, churn risk and restock fire with correct staging', async () => {
      const now = new Date();
      // closed job 3 days ago
      await prisma.job.create({
        data: {
          userId, companyId, customerId, jobNumber: 'J-P6', title: 'Done job',
          status: JobStatus.CLOSED, completedAt: new Date(now.getTime() - 3 * 86400000),
        },
      });
      // renewal due in 3 days
      await prisma.subscription.create({
        data: {
          userId, companyId, customerId, name: 'Renews soon', amount: 100,
          startDate: now, currentPeriodEnd: new Date(now.getTime() + 3 * 86400000),
        },
      });
      // past due 8 days → dunning stage 2
      await prisma.subscription.create({
        data: {
          userId, companyId, customerId, name: 'Past due', amount: 100,
          status: SubscriptionStatus.PAST_DUE,
          startDate: now, currentPeriodEnd: new Date(now.getTime() - 8 * 86400000),
        },
      });
      // past due 20 days → churn risk (+ dunning stage 3)
      await prisma.subscription.create({
        data: {
          userId, companyId, customerId, name: 'Churning', amount: 100,
          status: SubscriptionStatus.PAST_DUE,
          startDate: now, currentPeriodEnd: new Date(now.getTime() - 20 * 86400000),
        },
      });
      // low stock product
      await prisma.product.create({
        data: { userId, companyId, sku: 'LOW', name: 'Low stock', price: 10, stockQty: 2, lowStockThreshold: 5 },
      });

      const fired = await runAutomations(now);
      const rules = fired.map((f) => f.rule).sort();
      expect(rules).toContain('post_job_review');
      expect(rules).toContain('renewal_reminder');
      expect(rules).toContain('dunning:2');
      expect(rules).toContain('dunning:3');
      expect(rules).toContain('churn_risk');
      expect(rules).toContain('restock');

      const churned = await prisma.subscription.findFirst({ where: { name: 'Churning' } });
      expect(churned!.churnRisk).toBe(true);

      // full sweep is idempotent
      expect(await runAutomations(now)).toHaveLength(0);
    });
  });

  describe('holding-company views', () => {
    it('v_revenue_events_daily, v_crm_mrr, v_crm_pipeline_value, v_company_pnl_rollup return correct aggregates', async () => {
      await prisma.subscription.create({
        data: {
          userId, companyId, customerId, name: 'View sub', amount: 300, interval: 'QUARTERLY',
          startDate: new Date('2026-06-01'), currentPeriodEnd: new Date('2026-09-01'),
        },
      });
      const sub = await prisma.subscription.findFirst({ where: { name: 'View sub' } });
      await recordRenewal(sub!.id, new Date('2026-06-01T12:00:00Z'));

      await prisma.quote.create({
        data: {
          quoteNumber: 'Q-V1', userId, customerId, companyId, projectType: 'site',
          subtotal: 500, total: 500, validUntil: new Date(), status: 'SENT', sentAt: new Date(),
        },
      });

      const mrr: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM v_crm_mrr WHERE company_id = '${companyId}'`
      );
      expect(Number(mrr[0].mrr_cents)).toBe(10000); // 300/3 * 100

      const revenue: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM v_revenue_events_daily WHERE company_id = '${companyId}'`
      );
      expect(revenue).toHaveLength(1);
      expect(revenue[0].engine).toBe('SUBSCRIPTION');
      expect(Number(revenue[0].net_cents)).toBe(30000);

      const pipeline: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM v_crm_pipeline_value WHERE company_id = '${companyId}' AND record_type = 'quote'`
      );
      expect(Number(pipeline[0].value_cents)).toBe(50000);

      const pnl: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM v_company_pnl_rollup WHERE company_id = '${companyId}'`
      );
      expect(Number(pnl[0].revenue_cents)).toBe(30000);
    });

    it('v_commerce_sales_daily and v_attribution_cac_ltv compute margins and CAC/ROAS', async () => {
      await prisma.ingestSource.create({
        data: { userId, companyId, key: 'p6-shop', name: 'Shop', kind: 'custom', secret: 's' },
      });
      await prisma.product.create({
        data: { userId, companyId, sku: 'V-1', name: 'Viewable', price: 50, cogs: 20, stockQty: 10 },
      });
      await ingestOrder('p6-shop', {
        version: '1',
        event: 'order.paid',
        order: {
          external_id: 'v-ord-1',
          placed_at: '2026-06-05T10:00:00Z',
          customer: { email: 'v@x.com', name: 'View Buyer' },
          items: [{ sku: 'V-1', name: 'Viewable', quantity: 2, unit_price: '50' }],
          totals: { subtotal: '100', tax: '0', shipping: '0', discount: '0', total: '100' },
          attribution: { utm_source: 'google', utm_campaign: 'p6-camp' },
        },
      });
      await prisma.adSpend.create({
        data: { userId, companyId, date: new Date('2026-06-05'), channel: 'google', campaign: 'p6-camp', spend: 50 },
      });

      const sales: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM v_commerce_sales_daily WHERE company_id = '${companyId}'`
      );
      expect(sales).toHaveLength(1);
      expect(Number(sales[0].revenue_cents)).toBe(10000);
      expect(Number(sales[0].cogs_cents)).toBe(4000);
      expect(Number(sales[0].margin_cents)).toBe(6000);
      expect(sales[0].units).toBe(2);

      const attr: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM v_attribution_cac_ltv WHERE company_id = '${companyId}' AND channel = 'google'`
      );
      expect(attr).toHaveLength(1);
      expect(Number(attr[0].spend_cents)).toBe(5000);
      expect(attr[0].new_customers).toBe(1);
      expect(Number(attr[0].cac_cents)).toBe(5000);
      expect(Number(attr[0].attributed_revenue_cents)).toBe(10000);
      expect(Number(attr[0].roas)).toBeCloseTo(2);
    });
  });

  describe('MCP tools (handlers against the container DB)', () => {
    it('create_lead → log_activity → get_customer_360 round-trip', async () => {
      const lead = (await createLeadHandler(
        {
          name: 'MCP Lead', phone: '+15553334444', source: 'eve',
          company_id: companyId, utm_source: 'facebook', utm_campaign: 'mcp-camp',
        },
        pool as any
      )) as any;
      expect(lead.lead_id).toBeTruthy();
      expect(lead.status).toBe('NEW');

      const activity = (await logActivityHandler(
        { type: 'CALL', body: 'Spoke with MCP lead', lead_id: lead.lead_id, direction: 'OUTBOUND', source: 'eve' },
        pool as any
      )) as any;
      expect(activity.activity_id).toBeTruthy();

      await logActivityHandler(
        { type: 'NOTE', body: 'customer prefers mornings', customer_id: customerId },
        pool as any
      );
      const c360 = (await getCustomer360Handler({ customer_id: customerId }, pool as any)) as any;
      expect(c360.customer.name).toBe('P6 Customer');
      expect(c360.activities.length).toBeGreaterThanOrEqual(1);
      expect(c360.activities[0].body).toContain('mornings');
    });

    it('report tools read the views', async () => {
      await prisma.subscription.create({
        data: {
          userId, companyId, customerId, name: 'MCP sub', amount: 100,
          startDate: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      });
      const mrr = (await getMrrHandler({ company_id: companyId }, pool as any)) as any;
      expect(Number(mrr.rows[0].mrr_cents)).toBe(10000);

      await prisma.quote.create({
        data: {
          quoteNumber: 'Q-MCP', userId, customerId, companyId, projectType: 'x',
          subtotal: 10, total: 10, validUntil: new Date(), status: 'SENT',
          sentAt: new Date(Date.now() - 9 * 86400000),
        },
      });
      const pipeline = (await getPipelineHandler({ company_id: companyId }, pool as any)) as any;
      expect(pipeline.rows.length).toBeGreaterThanOrEqual(1);

      const aging = (await listAgingQuotesHandler({ company_id: companyId, min_age_days: 7 }, pool as any)) as any;
      expect(aging.count).toBe(1);
      expect(aging.quotes[0].age_days).toBeGreaterThanOrEqual(8);

      const jobs = (await listJobsTodayHandler({ company_id: companyId }, pool as any)) as any;
      expect(Array.isArray(jobs.jobs)).toBe(true);

      const revenue = (await getRevenueSummaryHandler({ company_id: companyId, days: 30 }, pool as any)) as any;
      expect(Array.isArray(revenue.by_engine)).toBe(true);
    });
  });
});
