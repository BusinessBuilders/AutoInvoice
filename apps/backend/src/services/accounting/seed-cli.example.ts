/**
 * CLI Command Example: Seed Chart of Accounts
 *
 * This file demonstrates how to add a CLI command for seeding the Chart of Accounts.
 * To integrate this into your existing CLI, copy the command handler below into your cli.ts file.
 */

import { Command } from 'commander';
import { seedDefaultAccounts, validateSystemAccounts } from './index';

/**
 * Add this to your CLI program in apps/backend/src/cli.ts
 */
export function registerAccountingSeedCommand(program: Command) {
  program
    .command('seed-accounts')
    .description('Seed the Chart of Accounts with default accounts')
    .option('--force', 'Force re-creation even if accounts exist', false)
    .option('--company-type <type>', 'Company type for industry-specific accounts')
    .option('--user-id <userId>', 'User ID to seed accounts for (required)')
    .action(async (options: { force: boolean; companyType?: string; userId?: string }) => {
      try {
        if (!options.userId) {
          console.error('❌ Error: --user-id is required');
          process.exit(1);
        }

        console.log('🌱 Seeding Chart of Accounts...\n');

        const result = await seedDefaultAccounts(options.userId, options.companyType);

        console.log('📊 Seeding Results:');
        console.log(`   ✓ Created:  ${result.created} accounts`);
        console.log(`   ⊘ Skipped:  ${result.skipped} accounts`);
        console.log(`   ∑ Total:    ${result.total} accounts\n`);

        // Validate system accounts
        console.log('🔍 Validating system accounts...');
        const missing = await validateSystemAccounts(options.userId);

        if (missing.length > 0) {
          console.error('❌ Missing system accounts:', missing.join(', '));
          process.exit(1);
        }

        console.log('✓ All system accounts validated\n');
        console.log('🎉 Chart of Accounts is ready!\n');

        // Print account summary
        const { prisma } = await import('../../utils/db');
        const accountsByType = await prisma.$queryRaw<
          Array<{ accountType: string; count: bigint }>
        >`
          SELECT "accountType", COUNT(*) as count
          FROM "Account"
          WHERE active = true
          GROUP BY "accountType"
          ORDER BY "accountType"
        `;

        console.log('📋 Account Summary by Type:');
        for (const row of accountsByType) {
          const count = Number(row.count);
          console.log(`   ${row.accountType.padEnd(12)} ${count} accounts`);
        }

        console.log('');
      } catch (error) {
        console.error('❌ Failed to seed accounts:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Standalone script usage
 *
 * You can also run this file directly:
 *
 * ```bash
 * npx tsx apps/backend/src/services/accounting/seed-cli.example.ts
 * ```
 */
if (require.main === module) {
  (async () => {
    try {
      // Get userId from command line args or environment
      const userId = process.argv[2] || process.env.USER_ID;
      if (!userId) {
        console.error('❌ Error: userId is required');
        console.error('Usage: npx tsx seed-cli.example.ts <userId>');
        console.error('   or: USER_ID=<userId> npx tsx seed-cli.example.ts');
        process.exit(1);
      }

      const result = await seedDefaultAccounts(userId);
      console.log('Seeding complete:', result);

      const missing = await validateSystemAccounts(userId);
      if (missing.length > 0) {
        console.error('Missing system accounts:', missing);
        process.exit(1);
      }

      console.log('✓ All system accounts validated');
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}
