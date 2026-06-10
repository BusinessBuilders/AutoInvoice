-- Business OS holding-company views (spec §6). ALL NEW objects — the existing
-- Wealth OS contract (v_company_cash_daily, v_ytd_pulse, v_super_nova_burn,
-- f_project_cash) is untouched. Amounts in cents (existing convention).

-- 1. Revenue normalized per engine per day — the spine, aggregated.
CREATE VIEW v_revenue_events_daily AS
SELECT
  re."companyId"                                   AS company_id,
  (re."occurredAt" AT TIME ZONE 'UTC')::date       AS date,
  re.engine::text                                  AS engine,
  COALESCE(SUM(CASE WHEN re.amount > 0 THEN ROUND(re.amount * 100) END), 0)::bigint  AS gross_cents,
  COALESCE(SUM(CASE WHEN re.amount < 0 THEN ROUND(-re.amount * 100) END), 0)::bigint AS refund_cents,
  ROUND(SUM(re.amount) * 100)::bigint              AS net_cents,
  COUNT(*)::int                                    AS event_count
FROM "RevenueEvent" re
GROUP BY 1, 2, 3;

-- 2. Open pipeline by stage (quotes awaiting decision + open leads).
CREATE VIEW v_crm_pipeline_value AS
SELECT
  q."companyId"                                    AS company_id,
  'quote'                                          AS record_type,
  q.status::text                                   AS stage,
  COUNT(*)::int                                    AS count,
  ROUND(SUM(q.total) * 100)::bigint                AS value_cents
FROM "Quote" q
WHERE q.status IN ('SENT', 'VIEWED')
GROUP BY 1, 3
UNION ALL
SELECT
  l."companyId"                                    AS company_id,
  'lead'                                           AS record_type,
  l.status::text                                   AS stage,
  COUNT(*)::int                                    AS count,
  COALESCE(ROUND(SUM(l."estimatedValue") * 100), 0)::bigint AS value_cents
FROM "Lead" l
WHERE l.status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'NEGOTIATING')
GROUP BY 1, 3;

-- 3. Quote win rate by month (won = ACCEPTED or CONVERTED, of quotes that left DRAFT).
CREATE VIEW v_crm_win_rate AS
SELECT
  q."companyId"                                    AS company_id,
  to_char(COALESCE(q."sentAt", q."createdAt") AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
  COUNT(*)::int                                    AS quotes_sent,
  COUNT(*) FILTER (WHERE q.status IN ('ACCEPTED', 'CONVERTED'))::int AS quotes_won,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE q.status IN ('ACCEPTED', 'CONVERTED')) / COUNT(*),
    1
  )::numeric                                       AS win_rate_pct,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (COALESCE(q."acceptedAt", q."rejectedAt") - q."sentAt")) / 86400.0
  )::numeric, 1)                                   AS avg_days_to_decision
FROM "Quote" q
WHERE q.status <> 'DRAFT'
GROUP BY 1, 2;

-- 4. MRR rollup (active + past-due normalized to monthly cents).
CREATE VIEW v_crm_mrr AS
SELECT
  s."companyId"                                    AS company_id,
  ROUND(SUM(
    CASE s.interval
      WHEN 'MONTHLY'   THEN s.amount
      WHEN 'QUARTERLY' THEN s.amount / 3
      WHEN 'YEARLY'    THEN s.amount / 12
    END
  ) FILTER (WHERE s.status IN ('ACTIVE', 'PAST_DUE')) * 100)::bigint AS mrr_cents,
  COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::int    AS active_subs,
  COUNT(*) FILTER (WHERE s.status = 'PAST_DUE')::int  AS past_due_subs,
  COUNT(*) FILTER (WHERE s."churnRisk")::int          AS churn_risk_subs
FROM "Subscription" s
GROUP BY 1;

-- 5. Commerce sales per day per channel with margin.
CREATE VIEW v_commerce_sales_daily AS
WITH paid_orders AS (
  SELECT o.id,
         o."companyId"                              AS company_id,
         (o."placedAt" AT TIME ZONE 'UTC')::date    AS date,
         o.source                                   AS channel,
         o.total,
         o."refundedAmount"                         AS refunded
  FROM "Order" o
  WHERE o.status IN ('PAID', 'FULFILLED', 'PARTIALLY_REFUNDED', 'REFUNDED')
),
item_agg AS (
  SELECT oi."orderId" AS order_id,
         SUM(oi.quantity)::int                      AS units,
         SUM(oi.quantity * COALESCE(oi."unitCogs", 0)) AS cogs
  FROM "OrderItem" oi
  GROUP BY 1
)
SELECT
  po.company_id,
  po.date,
  po.channel,
  COUNT(*)::int                                     AS orders,
  COALESCE(SUM(ia.units), 0)::int                   AS units,
  ROUND(SUM(po.total) * 100)::bigint                AS revenue_cents,
  COALESCE(ROUND(SUM(ia.cogs) * 100), 0)::bigint    AS cogs_cents,
  (ROUND(SUM(po.total) * 100)
    - COALESCE(ROUND(SUM(ia.cogs) * 100), 0))::bigint AS margin_cents,
  ROUND(SUM(po.refunded) * 100)::bigint             AS refund_cents
FROM paid_orders po
LEFT JOIN item_agg ia ON ia.order_id = po.id
GROUP BY 1, 2, 3;

-- 6. Attribution: CAC + ROAS per channel per month (first-touch).
CREATE VIEW v_attribution_cac_ltv AS
WITH spend AS (
  SELECT "companyId" AS company_id,
         to_char(date AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
         channel,
         ROUND(SUM(spend) * 100)::bigint AS spend_cents
  FROM "AdSpend"
  GROUP BY 1, 2, 3
),
new_customers AS (
  SELECT c."primaryCompanyId" AS company_id,
         to_char(c."firstTouchAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
         c."acquisitionSource" AS channel,
         COUNT(*)::int AS new_customers
  FROM "Customer" c
  WHERE c."firstTouchAt" IS NOT NULL AND c."acquisitionSource" IS NOT NULL
  GROUP BY 1, 2, 3
),
revenue AS (
  SELECT re."companyId" AS company_id,
         to_char(re."occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
         re."attributionSource" AS channel,
         ROUND(SUM(re.amount) * 100)::bigint AS attributed_revenue_cents
  FROM "RevenueEvent" re
  WHERE re."attributionSource" IS NOT NULL
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(s.company_id, n.company_id, r.company_id) AS company_id,
  COALESCE(s.month, n.month, r.month)                AS month,
  COALESCE(s.channel, n.channel, r.channel)          AS channel,
  COALESCE(s.spend_cents, 0)                         AS spend_cents,
  COALESCE(n.new_customers, 0)                       AS new_customers,
  CASE WHEN COALESCE(n.new_customers, 0) > 0
       THEN (COALESCE(s.spend_cents, 0) / n.new_customers)::bigint END AS cac_cents,
  COALESCE(r.attributed_revenue_cents, 0)            AS attributed_revenue_cents,
  CASE WHEN COALESCE(s.spend_cents, 0) > 0
       THEN ROUND(COALESCE(r.attributed_revenue_cents, 0)::numeric / s.spend_cents, 2) END AS roas
FROM spend s
FULL OUTER JOIN new_customers n USING (company_id, month, channel)
FULL OUTER JOIN revenue r USING (company_id, month, channel);

-- 7. Operational P&L rollup: revenue from the spine, expenses from categorized
-- bank transactions (same split/tax-type rules as v_company_cash_daily).
CREATE VIEW v_company_pnl_rollup AS
WITH revenue AS (
  SELECT "companyId" AS company_id,
         to_char("occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
         ROUND(SUM(amount) * 100)::bigint AS revenue_cents
  FROM "RevenueEvent"
  GROUP BY 1, 2
),
expenses AS (
  SELECT bt."companyId" AS company_id,
         to_char(bt.date AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
         ROUND(SUM(-bt.amount) * 100)::bigint AS expenses_cents
  FROM "BankTransaction" bt
  JOIN "TaxAccount" ta ON ta.id = bt."taxAccountId"
  WHERE ta."accountType"::text LIKE 'EXPENSE%'
    AND bt.amount < 0
    AND ((bt."isSplit" = false AND bt."parentId" IS NULL) OR bt."parentId" IS NOT NULL)
  GROUP BY 1, 2
)
SELECT
  COALESCE(rv.company_id, ex.company_id) AS company_id,
  COALESCE(rv.month, ex.month)           AS month,
  COALESCE(rv.revenue_cents, 0)          AS revenue_cents,
  COALESCE(ex.expenses_cents, 0)         AS expenses_cents,
  COALESCE(rv.revenue_cents, 0) - COALESCE(ex.expenses_cents, 0) AS net_cents
FROM revenue rv
FULL OUTER JOIN expenses ex USING (company_id, month);

-- Grants: additive only; guarded so this migration also runs in test
-- containers where the vision_reader role does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'vision_reader') THEN
    GRANT SELECT ON v_revenue_events_daily   TO vision_reader;
    GRANT SELECT ON v_crm_pipeline_value     TO vision_reader;
    GRANT SELECT ON v_crm_win_rate           TO vision_reader;
    GRANT SELECT ON v_crm_mrr                TO vision_reader;
    GRANT SELECT ON v_commerce_sales_daily   TO vision_reader;
    GRANT SELECT ON v_attribution_cac_ltv    TO vision_reader;
    GRANT SELECT ON v_company_pnl_rollup     TO vision_reader;
  END IF;
END
$$;
