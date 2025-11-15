#!/usr/bin/env tsx

/**
 * AutoInvoice CLI Tool
 * Admin command-line interface for system management
 *
 * Usage: npm run cli <command> [options]
 *
 * Commands:
 *   user:create <email> <password> <name>  Create admin user
 *   invoice:list [--status=PAID]          List invoices
 *   invoice:send <id>                    Send invoice by ID
 *   customer:list                        List all customers
 *   stats                                Show system statistics
 *   backup                               Create database backup
 *   cleanup                              Clean up old data
 *   worker:start                         Start queue workers
 *   telegram:start                       Start Telegram bot
 *   google:auth                          Initialize Google OAuth
 */

import { Command } from 'commander';
import { prisma } from './utils/db';
import { aiRouter } from './services/ai';
import { queueHelpers } from './services/queue';
import { sendInvoiceEmail } from './services/google/gmail';
import { getAuthUrl } from './services/google/oauth';
import { startTelegramBot } from './services/telegram/bot';
import { initializeWorkers } from './services/queue';
import logger from './utils/logger';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('autoinvoice')
  .description('AutoInvoice CLI - Admin tool for system management')
  .version('1.0.0');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USER MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

program
  .command('user:create')
  .description('Create a new admin user')
  .argument('<email>', 'User email')
  .argument('<password>', 'User password')
  .argument('<name>', 'User name')
  .action(async (email: string, password: string, name: string) => {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
        },
      });

      console.log(`✅ User created successfully!`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('user:list')
  .description('List all users')
  .action(async () => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      });

      console.log(`\n📋 Users (${users.length}):\n`);
      users.forEach((user) => {
        console.log(`  • ${user.name} <${user.email}>`);
        console.log(`    ID: ${user.id}`);
        console.log(`    Created: ${user.createdAt.toLocaleDateString()}\n`);
      });
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVOICE MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

program
  .command('invoice:list')
  .description('List invoices')
  .option('-s, --status <status>', 'Filter by status')
  .option('-l, --limit <number>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const invoices = await prisma.invoice.findMany({
        where: options.status ? { status: options.status } : undefined,
        take: parseInt(options.limit),
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
        },
      });

      console.log(`\n📄 Invoices (${invoices.length}):\n`);
      invoices.forEach((inv) => {
        console.log(`  ${inv.invoiceNumber} - ${inv.customer.name}`);
        console.log(`    Status: ${inv.status} | Total: $${inv.total} | Date: ${inv.serviceDate.toLocaleDateString()}\n`);
      });
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('invoice:send')
  .description('Send invoice via email')
  .argument('<id>', 'Invoice ID')
  .action(async (id: string) => {
    try {
      console.log(`📤 Sending invoice ${id}...`);

      await sendInvoiceEmail(id);

      console.log(`✅ Invoice sent successfully!`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('invoice:create')
  .description('Create invoice from natural language')
  .argument('<text>', 'Invoice description')
  .action(async (text: string) => {
    try {
      console.log('🤖 Parsing invoice with AI...\n');

      const invoiceData = await aiRouter.parseInvoice(text);

      console.log('✅ Parsed Invoice:');
      console.log(`   Customer: ${invoiceData.customerName}`);
      console.log(`   Date: ${invoiceData.serviceDate}`);
      console.log(`   Confidence: ${(invoiceData.confidence * 100).toFixed(1)}%\n`);
      console.log('   Services:');
      invoiceData.services.forEach((s) => {
        console.log(`     • ${s.description}: $${s.amount}`);
      });

      // TODO: Implement invoice creation
      console.log('\n💡 Tip: Use the web interface to complete invoice creation');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CUSTOMER MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

program
  .command('customer:list')
  .description('List all customers')
  .option('-l, --limit <number>', 'Limit results', '50')
  .action(async (options) => {
    try {
      const customers = await prisma.customer.findMany({
        take: parseInt(options.limit),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { invoices: true },
          },
        },
      });

      console.log(`\n👥 Customers (${customers.length}):\n`);
      customers.forEach((customer) => {
        console.log(`  ${customer.name}`);
        console.log(`    Email: ${customer.email || 'N/A'} | Phone: ${customer.phone || 'N/A'}`);
        console.log(`    Invoices: ${customer._count.invoices}\n`);
      });
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATISTICS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

program
  .command('stats')
  .description('Show system statistics')
  .action(async () => {
    try {
      const [
        totalInvoices,
        totalCustomers,
        totalServices,
        paidInvoices,
        overdueInvoices,
        totalRevenue,
      ] = await Promise.all([
        prisma.invoice.count(),
        prisma.customer.count(),
        prisma.service.count(),
        prisma.invoice.count({ where: { status: 'PAID' } }),
        prisma.invoice.count({ where: { status: 'OVERDUE' } }),
        prisma.invoice.aggregate({
          where: { status: 'PAID' },
          _sum: { total: true },
        }),
      ]);

      console.log('\n📊 AutoInvoice Statistics\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`  Total Invoices:     ${totalInvoices}`);
      console.log(`  Total Customers:    ${totalCustomers}`);
      console.log(`  Total Services:     ${totalServices}`);
      console.log(`  Paid Invoices:      ${paidInvoices}`);
      console.log(`  Overdue Invoices:   ${overdueInvoices}`);
      console.log(`  Total Revenue:      $${(totalRevenue._sum.total || 0).toFixed(2)}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATABASE OPERATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

program
  .command('backup')
  .description('Create database backup')
  .option('-o, --output <path>', 'Output file path', `./backups/backup-${Date.now()}.json`)
  .action(async (options) => {
    try {
      console.log('💾 Creating database backup...');

      const [customers, services, invoices, receipts] = await Promise.all([
        prisma.customer.findMany({ include: { locations: true, priceOverrides: true } }),
        prisma.service.findMany(),
        prisma.invoice.findMany({ include: { lineItems: true } }),
        prisma.receipt.findMany(),
      ]);

      const backup = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: {
          customers,
          services,
          invoices,
          receipts,
        },
      };

      // Ensure directory exists
      const dir = path.dirname(options.output);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(options.output, JSON.stringify(backup, null, 2));

      console.log(`✅ Backup created: ${options.output}`);
      console.log(`   Customers: ${customers.length}`);
      console.log(`   Services: ${services.length}`);
      console.log(`   Invoices: ${invoices.length}`);
      console.log(`   Receipts: ${receipts.length}`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('cleanup')
  .description('Clean up old data')
  .option('-d, --days <number>', 'Delete invoices older than X days', '365')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .action(async (options) => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(options.days));

      const oldInvoices = await prisma.invoice.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          status: 'PAID',
        },
      });

      console.log(`\n🗑️  Found ${oldInvoices.length} old paid invoices\n`);

      if (options.dryRun) {
        console.log('DRY RUN - No data will be deleted\n');
        oldInvoices.forEach((inv) => {
          console.log(`  Would delete: ${inv.invoiceNumber} (${inv.createdAt.toLocaleDateString()})`);
        });
      } else {
        for (const invoice of oldInvoices) {
          await prisma.invoice.delete({ where: { id: invoice.id } });
          console.log(`  Deleted: ${invoice.invoiceNumber}`);
        }
        console.log(`\n✅ Cleanup complete!`);
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SERVICES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

program
  .command('worker:start')
  .description('Start queue workers')
  .action(() => {
    console.log('🔄 Starting queue workers...');
    initializeWorkers();
    console.log('✅ Workers started. Press Ctrl+C to stop.');

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down workers...');
      process.exit(0);
    });
  });

program
  .command('telegram:start')
  .description('Start Telegram bot')
  .action(() => {
    console.log('🤖 Starting Telegram bot...');
    startTelegramBot();
    console.log('✅ Bot started. Press Ctrl+C to stop.');

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down bot...');
      process.exit(0);
    });
  });

program
  .command('google:auth')
  .description('Get Google OAuth authorization URL')
  .action(() => {
    try {
      const authUrl = getAuthUrl();
      console.log('\n🔐 Google OAuth Authorization\n');
      console.log('Open this URL in your browser:\n');
      console.log(authUrl);
      console.log('\nAfter authorizing, you\'ll be redirected back to the app.\n');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARSE AND EXECUTE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

program.parse();
