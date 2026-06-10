import { AccountType, BalanceType, Prisma } from '@prisma/client';
import { prisma } from '../../utils/db';
import logger from '../../utils/logger';

/**
 * Multi-tenant account seeding service.
 * Creates a Chart of Accounts for a specific user.
 */

/**
 * Default account configuration for a standard Chart of Accounts
 */
interface DefaultAccount {
  code: string;
  name: string;
  accountType: AccountType;
  balanceType: BalanceType;
  description?: string;
  systemAccount?: boolean;
  taxEnabled?: boolean;
  taxRate?: number;
}

/**
 * Standard Chart of Accounts template
 * Following standard accounting numbering conventions:
 * - 1000-1999: Assets
 * - 2000-2999: Liabilities
 * - 3000-3999: Equity
 * - 4000-4999: Revenue
 * - 5000-6999: Expenses
 */
const DEFAULT_ACCOUNTS: DefaultAccount[] = [
  // === ASSETS (1000-1999) ===
  {
    code: '1000',
    name: 'Cash',
    accountType: 'ASSET',
    balanceType: 'DEBIT',
    description: 'Cash on hand and in registers',
    systemAccount: true,
  },
  {
    code: '1010',
    name: 'Checking Account',
    accountType: 'ASSET',
    balanceType: 'DEBIT',
    description: 'Primary business checking account',
  },
  {
    code: '1100',
    name: 'Accounts Receivable',
    accountType: 'ASSET',
    balanceType: 'DEBIT',
    description: 'Outstanding customer invoices',
    systemAccount: true,
  },
  {
    code: '1500',
    name: 'Equipment',
    accountType: 'ASSET',
    balanceType: 'DEBIT',
    description: 'Business equipment and machinery',
  },
  {
    code: '1600',
    name: 'Vehicles',
    accountType: 'ASSET',
    balanceType: 'DEBIT',
    description: 'Business vehicles',
  },

  // === LIABILITIES (2000-2999) ===
  {
    code: '2000',
    name: 'Accounts Payable',
    accountType: 'LIABILITY',
    balanceType: 'CREDIT',
    description: 'Outstanding bills and vendor payments',
    systemAccount: true,
  },
  {
    code: '2100',
    name: 'Credit Card',
    accountType: 'LIABILITY',
    balanceType: 'CREDIT',
    description: 'Business credit card balances',
  },
  {
    code: '2200',
    name: 'Sales Tax Payable',
    accountType: 'LIABILITY',
    balanceType: 'CREDIT',
    description: 'Sales tax collected from customers',
    taxEnabled: true,
  },

  // === EQUITY (3000-3999) ===
  {
    code: '3000',
    name: "Owner's Equity",
    accountType: 'EQUITY',
    balanceType: 'CREDIT',
    description: "Owner's investment in the business",
    systemAccount: true,
  },
  {
    code: '3100',
    name: 'Retained Earnings',
    accountType: 'EQUITY',
    balanceType: 'CREDIT',
    description: 'Accumulated profits retained in the business',
    systemAccount: true,
  },
  {
    code: '3200',
    name: "Owner's Draw",
    accountType: 'EQUITY',
    balanceType: 'DEBIT',
    description: 'Owner withdrawals from the business',
  },

  // === REVENUE (4000-4999) ===
  {
    code: '4000',
    name: 'Service Revenue',
    accountType: 'REVENUE',
    balanceType: 'CREDIT',
    description: 'Income from services provided',
    systemAccount: true,
  },
  {
    code: '4100',
    name: 'Materials Revenue',
    accountType: 'REVENUE',
    balanceType: 'CREDIT',
    description: 'Income from materials sold',
  },

  // === EXPENSES (5000-6999) ===
  // Cost of Goods Sold (5000-5999)
  {
    code: '5000',
    name: 'Materials Cost',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Cost of materials used in services (COGS)',
  },
  {
    code: '5100',
    name: 'Subcontractor Costs',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Payments to subcontractors (COGS)',
  },

  // Operating Expenses (6000-6999)
  {
    code: '6000',
    name: 'Advertising',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Marketing and advertising expenses',
  },
  {
    code: '6100',
    name: 'Auto & Truck',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Vehicle expenses (maintenance, registration, etc.)',
  },
  {
    code: '6200',
    name: 'Bank Fees',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Bank charges and transaction fees',
  },
  {
    code: '6300',
    name: 'Equipment Rental',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Rental of equipment and tools',
  },
  {
    code: '6400',
    name: 'Fuel',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Fuel for vehicles and equipment',
  },
  {
    code: '6500',
    name: 'Insurance',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Business insurance premiums',
  },
  {
    code: '6600',
    name: 'Office Supplies',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Office supplies and administrative materials',
  },
  {
    code: '6700',
    name: 'Repairs & Maintenance',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Repairs and maintenance of equipment/vehicles',
  },
  {
    code: '6800',
    name: 'Tools & Equipment',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Purchase of small tools and equipment',
  },
  {
    code: '6900',
    name: 'Utilities',
    accountType: 'EXPENSE',
    balanceType: 'DEBIT',
    description: 'Electricity, water, gas, internet, phone',
  },
];

/**
 * Seeds default Chart of Accounts for a specific user
 *
 * This function is idempotent - safe to call multiple times.
 * It will only create accounts that don't already exist for the user.
 *
 * @param userId - The user ID to create accounts for
 * @param companyType - Optional company type for future customization (e.g., 'landscaping', 'construction')
 * @returns Object with counts of created and skipped accounts
 * @throws Error if database operation fails or userId is missing
 */
export async function seedDefaultAccounts(
  userId: string,
  companyType?: string
): Promise<{ created: number; skipped: number; total: number }> {
  if (!userId) {
    throw new Error('userId is required for seeding accounts');
  }
  try {
    logger.info('Seeding default Chart of Accounts', {
      companyType,
    });

    // Check if accounts already exist for this user
    const existingAccountsCount = await prisma.account.count({
      where: { userId },
    });

    if (existingAccountsCount > 0) {
      logger.info(
        `User ${userId} already has ${existingAccountsCount} accounts, seeding remaining defaults`
      );
    }

    let created = 0;
    let skipped = 0;

    // Get all existing account codes for this user to avoid duplicates
    const existingAccounts = await prisma.account.findMany({
      where: { userId },
      select: { code: true },
    });
    const existingCodes = new Set(existingAccounts.map((a: { code: string }) => a.code));

    // Create accounts in a transaction for data consistency
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const account of DEFAULT_ACCOUNTS) {
        // Skip if account already exists
        if (existingCodes.has(account.code)) {
          skipped++;
          logger.debug(`Skipping existing account ${account.code}`);
          continue;
        }

        await tx.account.create({
          data: {
            userId,
            code: account.code,
            name: account.name,
            accountType: account.accountType,
            balanceType: account.balanceType,
            description: account.description,
            active: true,
            systemAccount: account.systemAccount ?? false,
            taxEnabled: account.taxEnabled ?? false,
            taxRate: account.taxRate,
          },
        });
        created++;
      }
    });

    logger.info('Account seeding complete', {
      created,
      skipped,
      total: DEFAULT_ACCOUNTS.length,
    });

    return {
      created,
      skipped,
      total: DEFAULT_ACCOUNTS.length,
    };
  } catch (error) {
    logger.error('Failed to seed default accounts', {
      companyType,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to seed default accounts: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * System account codes for automated journal entries
 * These accounts are essential for the accounting system to function
 *
 * NOTE: The journal-service.ts uses slightly different codes for compatibility
 * with existing data. This will be reconciled once multi-tenancy is added.
 */
export const ACCOUNT_CODES = {
  CASH: '1000',
  CHECKING: '1010',
  ACCOUNTS_RECEIVABLE: '1100',
  ACCOUNTS_PAYABLE: '2000',
  SALES_TAX_PAYABLE: '2200',
  OWNERS_EQUITY: '3000',
  RETAINED_EARNINGS: '3100',
  SERVICE_REVENUE: '4000',
} as const;

// Backward compatibility alias
export const SYSTEM_ACCOUNTS = ACCOUNT_CODES;

/**
 * Gets a system account by code
 *
 * @param accountCode - One of the SYSTEM_ACCOUNTS codes
 * @returns The account or null if not found
 */
export async function getSystemAccount(accountCode: string) {
  try {
    return await prisma.account.findFirst({
      where: {
        code: accountCode,
        active: true,
      },
    });
  } catch (error) {
    logger.error('Failed to get system account', {
      accountCode,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Validates that all required system accounts exist
 *
 * @returns Array of missing system account codes, empty if all exist
 */
export async function validateSystemAccounts(userId: string): Promise<string[]> {
  if (!userId) {
    throw new Error('userId is required for validating system accounts');
  }

  try {
    const systemAccountCodes = Object.values(ACCOUNT_CODES);
    const existingAccounts = await prisma.account.findMany({
      where: {
        userId,
        code: { in: systemAccountCodes },
        active: true,
      },
      select: { code: true },
    });

    const existingCodes = new Set(existingAccounts.map((a: { code: string }) => a.code));
    const missingCodes = systemAccountCodes.filter(
      (code) => !existingCodes.has(code)
    );

    if (missingCodes.length > 0) {
      logger.warn('User is missing required system accounts', {
        userId,
        missingCodes,
      });
    }

    return missingCodes;
  } catch (error) {
    logger.error('Failed to validate system accounts', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
