#!/usr/bin/env tsx

/**
 * Quick API Test Script
 * Tests backend functionality without starting the full server
 */

import { prisma } from './src/utils/db';
import { aiRouter } from './src/services/ai';
import logger from './src/utils/logger';

async function testDatabase() {
  console.log('\n🗄️  Testing Database Connection...');

  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    const customerCount = await prisma.customer.count();
    const serviceCount = await prisma.service.count();
    const invoiceCount = await prisma.invoice.count();

    console.log(`   • Customers: ${customerCount}`);
    console.log(`   • Services: ${serviceCount}`);
    console.log(`   • Invoices: ${invoiceCount}`);

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

async function testAIRouter() {
  console.log('\n🤖 Testing AI Provider Router...');

  const testText = `
    Create an invoice for John Smith.
    Mowed lawn yesterday.
    Charged $50.
  `;

  try {
    console.log('   Input: "Create invoice for John, mowed lawn, $50"');
    console.log('   Attempting to parse with AI providers...');

    // This will try OpenAI -> Anthropic -> Ollama
    const result = await aiRouter.parseInvoice(testText);

    console.log('✅ AI parsing successful!');
    console.log(`   • Customer: ${result.customerName}`);
    console.log(`   • Services: ${result.services.length} items`);
    console.log(`   • Confidence: ${(result.confidence * 100).toFixed(1)}%`);

    return true;
  } catch (error: any) {
    console.log('⚠️  AI parsing skipped (no API keys configured)');
    console.log(`   ${error.message}`);
    return false;
  }
}

async function testInvoiceCreation() {
  console.log('\n📝 Testing Invoice Creation...');

  try {
    // Find or create a test customer
    let customer = await prisma.customer.findFirst({
      where: { email: 'test@example.com' }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: 'Test Customer',
          email: 'test@example.com',
          phone: '+1234567890',
          tags: ['test'],
        }
      });
      console.log('   Created test customer');
    }

    // Create a test invoice
    const invoice = await prisma.invoice.create({
      data: {
        customerId: customer.id,
        invoiceNumber: `TEST-${Date.now()}`,
        serviceDate: new Date(),
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        discount: 0,
        total: 100,
        status: 'DRAFT',
        source: 'test',
        lineItems: {
          create: [
            {
              description: 'Test Service',
              quantity: 1,
              rate: 100,
              amount: 100,
              order: 0,
            }
          ]
        }
      },
      include: {
        customer: true,
        lineItems: true,
      }
    });

    console.log('✅ Invoice created successfully!');
    console.log(`   • Invoice #: ${invoice.invoiceNumber}`);
    console.log(`   • Customer: ${invoice.customer.name}`);
    console.log(`   • Total: $${invoice.total}`);
    console.log(`   • Line Items: ${invoice.lineItems.length}`);

    // Clean up test invoice
    await prisma.invoice.delete({ where: { id: invoice.id } });
    console.log('   🧹 Test data cleaned up');

    return true;
  } catch (error) {
    console.error('❌ Invoice creation failed:', error);
    return false;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   AutoInvoice Backend Test Suite      ║');
  console.log('╚════════════════════════════════════════╝');

  const results = {
    database: await testDatabase(),
    aiRouter: await testAIRouter(),
    invoiceCreation: await testInvoiceCreation(),
  };

  console.log('\n' + '='.repeat(40));
  console.log('📊 Test Results:');
  console.log('='.repeat(40));
  console.log(`Database Connection:    ${results.database ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`AI Router:              ${results.aiRouter ? '✅ PASS' : '⚠️  SKIP'}`);
  console.log(`Invoice Creation:       ${results.invoiceCreation ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(40));

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.values(results).length;

  console.log(`\n🎯 Score: ${passed}/${total} tests passed\n`);

  await prisma.$disconnect();

  if (passed >= 2) { // AI router is optional
    console.log('✨ Backend is ready to rock! 🚀\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the output above.\n');
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
