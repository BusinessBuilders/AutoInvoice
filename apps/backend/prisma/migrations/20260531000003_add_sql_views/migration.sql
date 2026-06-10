-- v_company_cash_daily: daily inflow/expense/net per company (in cents)
CREATE OR REPLACE VIEW v_company_cash_daily AS
SELECT
  bt."companyId" AS company_id,
  bt.date::date AS date,
  (COALESCE(SUM(bt.amount) FILTER (WHERE bt.amount > 0), 0) * 100)::bigint AS gross_inflow_cents,
  (COALESCE(SUM(ABS(bt.amount)) FILTER (WHERE bt.amount < 0), 0) * 100)::bigint AS expenses_cents,
  (COALESCE(SUM(bt.amount), 0) * 100)::bigint AS net_cents
FROM "BankTransaction" bt
WHERE (bt."isSplit" = false AND bt."parentId" IS NULL)
   OR bt."parentId" IS NOT NULL
GROUP BY bt."companyId", bt.date::date;

-- v_ytd_pulse: YTD aggregates per company per year (in cents)
CREATE OR REPLACE VIEW v_ytd_pulse AS
WITH yearly AS (
  SELECT
    EXTRACT(YEAR FROM d.date)::int AS year,
    d.company_id,
    SUM(d.gross_inflow_cents)::bigint AS ytd_inflow_cents,
    SUM(d.expenses_cents)::bigint AS ytd_expenses_cents
  FROM v_company_cash_daily d
  GROUP BY EXTRACT(YEAR FROM d.date)::int, d.company_id
),
supernova AS (
  SELECT
    EXTRACT(YEAR FROM bt.date)::int AS year,
    bt."companyId" AS company_id,
    (SUM(ABS(bt.amount)) * 100)::bigint AS ytd_supernova_cents
  FROM "BankTransaction" bt
  JOIN "TaxAccount" ta ON bt."taxAccountId" = ta.id
  WHERE (ta.name ILIKE '%super nova%' OR ta.name ILIKE '%supernova%')
    AND bt.amount < 0
    AND ((bt."isSplit" = false AND bt."parentId" IS NULL) OR bt."parentId" IS NOT NULL)
  GROUP BY EXTRACT(YEAR FROM bt.date)::int, bt."companyId"
)
SELECT
  y.year,
  y.company_id,
  y.ytd_inflow_cents,
  y.ytd_expenses_cents,
  COALESCE(s.ytd_supernova_cents, 0)::bigint AS ytd_supernova_cents,
  (y.ytd_inflow_cents - y.ytd_expenses_cents)::bigint AS ytd_net_cents
FROM yearly y
LEFT JOIN supernova s ON s.year = y.year AND s.company_id = y.company_id;

-- v_super_nova_burn: Super Nova expense rows by day + category (in cents)
CREATE OR REPLACE VIEW v_super_nova_burn AS
SELECT
  bt.date::date AS date,
  COALESCE(ta.name, 'unspecified') AS category,
  (SUM(ABS(bt.amount)) * 100)::bigint AS cents
FROM "BankTransaction" bt
LEFT JOIN "TaxAccount" ta ON bt."taxAccountId" = ta.id
WHERE (ta.name ILIKE '%super nova%' OR ta.name ILIKE '%supernova%')
  AND bt.amount < 0
  AND ((bt."isSplit" = false AND bt."parentId" IS NULL) OR bt."parentId" IS NOT NULL)
GROUP BY bt.date::date, COALESCE(ta.name, 'unspecified');

-- Grant views to vision_reader
GRANT SELECT ON v_company_cash_daily TO vision_reader;
GRANT SELECT ON v_ytd_pulse TO vision_reader;
GRANT SELECT ON v_super_nova_burn TO vision_reader;
