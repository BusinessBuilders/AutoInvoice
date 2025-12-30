/**
 * Accounting Services
 *
 * Centralized exports for accounting-related business logic
 */

export {
  seedDefaultAccounts,
  getSystemAccount,
  validateSystemAccounts,
  ACCOUNT_CODES,
  SYSTEM_ACCOUNTS, // Backward compatibility alias
} from './seed-accounts';

// Journal entry services
export {
  createJournalEntry,
  createInvoiceRecognitionEntry,
  createInvoicePaymentEntry,
  createExpenseEntry,
  createCheckDepositEntry,
  voidJournalEntry,
  postEntry,
} from './journal-service';

// Financial reports
export {
  generateProfitAndLoss,
  type ProfitAndLossReport,
} from './reports';
