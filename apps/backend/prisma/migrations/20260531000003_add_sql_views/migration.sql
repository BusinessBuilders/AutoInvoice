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
SELECT
  EXTRACT(YEAR FROM d.date)::int AS year,
  d.company_id,
  SUM(d.gross_inflow_cents)::bigint AS ytd_inflow_cents,
  SUM(d.expenses_cents)::bigint AS ytd_expenses_cents,
  COALESCE((
    SELECT (SUM(ABS(bt2.amount)) * 100)::bigint
    FROM "BankTransaction" bt2
    JOIN "TaxAccount" ta ON bt2."taxAccountId" = ta.id
    WHERE bt2."companyId" = d.company_id
      AND (ta.name ILIKE '%super nova%' OR ta.name ILIKE '%supernova%')
      AND bt2.amount < 0
      AND EXTRACT(YEAR FROM bt2.date) = EXTRACT(YEAR FROM d.date)
      AND ((bt2."isSplit" = false AND bt2."parentId" IS NULL) OR bt2."parentId" IS NOT NULL)
  ), 0)::bigint AS ytd_supernova_cents,
  (SUM(d.net_cents) - COALESCE((
    SELECT (SUM(ABS(bt2.amount)) * 100)::bigint
    FROM "BankTransaction" bt2
    JOIN "TaxAccount" ta ON bt2."taxAccountId" = ta.id
    WHERE bt2."companyId" = d.company_id
      AND (ta.name ILIKE '%super nova%' OR ta.name ILIKE '%supernova%')
      AND bt2.amount < 0
      AND EXTRACT(YEAR FROM bt2.date) = EXTRACT(YEAR FROM d.date)
      AND ((bt2."isSplit" = false AND bt2."parentId" IS NULL) OR bt2."parentId" IS NOT NULL)
  ), 0))::bigint AS ytd_net_cents
FROM v_company_cash_daily d
GROUP BY EXTRACT(YEAR FROM d.date), d.company_id;

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
