-- Companies
INSERT INTO "Company" (id, "userId", name, active) VALUES
  ('seed-donovan-farms', 'user1', 'Donovan Farms', true),
  ('seed-business-builders', 'user1', 'Business Builders', true),
  ('seed-super-nova', 'user1', 'Super Nova Robotics', true);

-- Tax Accounts
INSERT INTO "TaxAccount" (id, "companyId", code, name, "accountType", "taxTreatment") VALUES
  ('ta-income-df', 'seed-donovan-farms', '4010', 'Gross Receipts', 'INCOME', '100%'),
  ('ta-expense-df', 'seed-donovan-farms', '6100', 'Operating Expenses', 'EXPENSE_OPERATING', '100%'),
  ('ta-income-bb', 'seed-business-builders', '4010', 'Gross Receipts', 'INCOME', '100%'),
  ('ta-expense-bb', 'seed-business-builders', '6100', 'Operating Expenses', 'EXPENSE_OPERATING', '100%'),
  ('ta-supernova', 'seed-super-nova', '6200', 'Super Nova - R&D', 'EXPENSE_OPERATING', '100%');

-- Bank Transactions (mix of income and expenses over past 90 days)
INSERT INTO "BankTransaction" (id, "companyId", "bankAccountId", date, description, amount, "taxAccountId", "isSplit") VALUES
  ('tx-df-1', 'seed-donovan-farms', 'bank1', NOW() - INTERVAL '80 days', 'Lawn service payment', 2500.00, 'ta-income-df', false),
  ('tx-df-2', 'seed-donovan-farms', 'bank1', NOW() - INTERVAL '60 days', 'Equipment rental', -500.00, 'ta-expense-df', false),
  ('tx-df-3', 'seed-donovan-farms', 'bank1', NOW() - INTERVAL '40 days', 'Snow removal payment', 3000.00, 'ta-income-df', false),
  ('tx-df-4', 'seed-donovan-farms', 'bank1', NOW() - INTERVAL '20 days', 'Fuel', -200.00, 'ta-expense-df', false),
  ('tx-df-5', 'seed-donovan-farms', 'bank1', NOW() - INTERVAL '5 days', 'Landscaping job', 1800.00, 'ta-income-df', false),
  ('tx-bb-1', 'seed-business-builders', 'bank2', NOW() - INTERVAL '70 days', 'Website project', 4000.00, 'ta-income-bb', false),
  ('tx-bb-2', 'seed-business-builders', 'bank2', NOW() - INTERVAL '50 days', 'Hosting costs', -150.00, 'ta-expense-bb', false),
  ('tx-bb-3', 'seed-business-builders', 'bank2', NOW() - INTERVAL '30 days', 'SEO retainer', 2000.00, 'ta-income-bb', false),
  ('tx-bb-4', 'seed-business-builders', 'bank2', NOW() - INTERVAL '10 days', 'Software licenses', -300.00, 'ta-expense-bb', false),
  ('tx-sn-1', 'seed-super-nova', 'bank3', NOW() - INTERVAL '45 days', 'Actuator parts', -800.00, 'ta-supernova', false),
  ('tx-sn-2', 'seed-super-nova', 'bank3', NOW() - INTERVAL '15 days', 'Motor controllers', -1200.00, 'ta-supernova', false);

-- Reconciliation log (Donovan Farms reconciled recently, others not)
INSERT INTO reconciliation_log (id, "companyId", "throughDate", source, "writtenBy", note) VALUES
  ('recon-df', 'seed-donovan-farms', CURRENT_DATE - INTERVAL '3 days', 'manual', 'donovan', 'Weekly reconciliation');
