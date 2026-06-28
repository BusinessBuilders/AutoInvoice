-- Transaction-level search surface for the Wealth OS advisor.
-- ADDITIVE: the existing contract (v_company_cash_daily, v_ytd_pulse,
-- v_super_nova_burn, f_project_cash) is untouched.
--
-- Grain: one row per countable bank transaction. Split-safe like
-- v_company_cash_daily: split parents are excluded, split children included,
-- so amounts never double-count.

CREATE VIEW v_transactions_search AS
SELECT
  bt.id                            AS transaction_id,
  bt.date::date                    AS date,
  bt."companyId"                   AS company_id,
  ROUND(bt.amount * 100)::bigint   AS amount_cents,
  bt.description                   AS description,
  COALESCE(v.name, bt."vendorRaw") AS vendor,
  ta.name                          AS category,
  ba.name                          AS account_name
FROM "BankTransaction" bt
LEFT JOIN "Vendor" v       ON v.id  = bt."vendorId"
LEFT JOIN "TaxAccount" ta  ON ta.id = bt."taxAccountId"
LEFT JOIN "BankAccount" ba ON ba.id = bt."bankAccountId"
WHERE ((bt."isSplit" = false AND bt."parentId" IS NULL) OR bt."parentId" IS NOT NULL);

-- Grant guarded so this migration also runs in test containers where the
-- vision_reader role does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'vision_reader') THEN
    GRANT SELECT ON v_transactions_search TO vision_reader;
  END IF;
END
$$;
