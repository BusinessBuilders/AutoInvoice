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
import { generateInvoicePdf } from './services/pdf/professional-generator';
import * as smartTemplates from './services/smart-templates';
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
// QUICK INVOICE ENTRY (SMART TEMPLATES)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

program
  .command('quick')
  .description('Quick invoice from natural language')
  .argument('<text>', 'Invoice description (e.g., "9999 sqft hydroseed for Blair today")')
  .option('-p, --pdf', 'Generate PDF immediately')
  .option('-o, --output <path>', 'PDF output path')
  .action(async (text: string, options) => {
    try {
      console.log('🚀 Creating quick invoice...\n');

      const invoice = await smartTemplates.createQuickInvoice({ text });

      console.log('✅ Invoice Created!\n');
      console.log(`📄 Invoice #: ${invoice.invoiceNumber}`);
      console.log(`👤 Customer: ${invoice.customer.name}`);
      console.log(`💰 Total: $${invoice.total.toFixed(2)}`);
      console.log(`📅 Date: ${invoice.serviceDate.toLocaleDateString()}\n`);

      if (options.pdf) {
        console.log('📄 Generating PDF...');
        const pdfBuffer = await generateInvoicePdf({
          invoiceId: invoice.id,
          template: 'professional',
        });

        const outputPath = options.output || `./invoices/${invoice.invoiceNumber}.pdf`;
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(outputPath, pdfBuffer);
        console.log(`✅ PDF saved: ${outputPath}\n`);
      }

      console.log('💡 Next steps:');
      console.log(`   • Generate PDF: npm run cli pdf ${invoice.id}`);
      console.log(`   • Send email: npm run cli invoice:send ${invoice.id}\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      console.log('\n💡 Tips:');
      console.log('   • Make sure customer exists: npm run cli customer:add');
      console.log('   • Make sure service exists: npm run cli service:add');
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('customer:add')
  .description('Quick add customer')
  .argument('<name>', 'Customer name')
  .option('-e, --email <email>', 'Email address')
  .option('-p, --phone <phone>', 'Phone number')
  .option('-a, --address <address>', 'Street address')
  .option('-n, --nickname <nicknames...>', 'Nicknames (space separated)')
  .action(async (name: string, options) => {
    try {
      const customer = await smartTemplates.quickAddCustomer({
        name,
        email: options.email,
        phone: options.phone,
        address: options.address,
        nickname: options.nickname || [name],
      });

      console.log('\n✅ Customer added!\n');
      console.log(`   Name: ${customer.name}`);
      console.log(`   ID: ${customer.id}`);
      if (customer.email) console.log(`   Email: ${customer.email}`);
      if (customer.phone) console.log(`   Phone: ${customer.phone}`);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('service:add')
  .description('Quick add service')
  .argument('<name>', 'Service name')
  .argument('<code>', 'Service code (e.g., HYDROSEED)')
  .argument('<category>', 'Category (e.g., Landscaping)')
  .option('-p, --price <price>', 'Base price per unit')
  .option('-u, --unit <unit>', 'Price unit (e.g., sqft, hour)', 'unit')
  .option('--user-id <userId>', 'User ID (defaults to first user)')
  .action(async (name: string, code: string, category: string, options) => {
    try {
      // Get userId from option or fallback to first user
      let userId = options.userId;
      if (!userId) {
        const firstUser = await prisma.user.findFirst();
        if (!firstUser) {
          throw new Error('No users found. Please create a user first or specify --user-id');
        }
        userId = firstUser.id;
      }

      const service = await smartTemplates.quickAddService({
        name,
        code: code.toUpperCase(),
        category,
        basePrice: options.price ? parseFloat(options.price) : undefined,
        priceUnit: options.unit,
        userId,
      });

      console.log('\n✅ Service added!\n');
      console.log(`   Name: ${service.name}`);
      console.log(`   Code: ${service.code}`);
      console.log(`   Category: ${service.category}`);
      if (service.basePrice) console.log(`   Price: $${service.basePrice}/${service.priceUnit}`);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('pricing:set')
  .description('Set customer-specific pricing')
  .argument('<customer>', 'Customer name')
  .argument('<service>', 'Service name or code')
  .argument('<price>', 'Price per unit')
  .option('-u, --unit <unit>', 'Price unit override')
  .action(async (customer: string, service: string, price: string, options) => {
    try {
      await smartTemplates.setCustomerPricing(
        customer,
        service,
        parseFloat(price),
        options.unit
      );

      console.log('\n✅ Custom pricing set!\n');
      console.log(`   Customer: ${customer}`);
      console.log(`   Service: ${service}`);
      console.log(`   Price: $${price}${options.unit ? `/${options.unit}` : ''}\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('pricing:show')
  .description('Show customer pricing')
  .argument('<customer>', 'Customer name')
  .action(async (customer: string) => {
    try {
      const pricing = await smartTemplates.getCustomerPricing(customer);

      console.log(`\n💰 Pricing for ${customer}:\n`);

      if (pricing.length === 0) {
        console.log('   No custom pricing set. Using default prices.\n');
      } else {
        pricing.forEach((p) => {
          console.log(`   ${p.service} (${p.code})`);
          console.log(`      Custom:  $${p.customPrice}/${p.unit}`);
          console.log(`      Default: $${p.defaultPrice}/${p.unit}\n`);
        });
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program
  .command('pdf')
  .description('Generate PDF for existing invoice')
  .argument('<invoice-id>', 'Invoice ID')
  .option('-t, --template <template>', 'Template (professional, minimal, standard)', 'professional')
  .option('-o, --output <path>', 'Output path')
  .action(async (invoiceId: string, options) => {
    try {
      console.log('📄 Generating PDF...');

      const pdfBuffer = await generateInvoicePdf({
        invoiceId,
        template: options.template,
      });

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { invoiceNumber: true },
      });

      const outputPath = options.output || `./invoices/${invoice?.invoiceNumber || invoiceId}.pdf`;
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, pdfBuffer);
      console.log(`✅ PDF saved: ${outputPath}`);
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
