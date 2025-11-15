import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create sample services
  const services = await Promise.all([
    prisma.service.upsert({
      where: { code: 'LAWN_MOW' },
      update: {},
      create: {
        code: 'LAWN_MOW',
        name: 'Lawn Mowing',
        category: 'Lawn Care',
        description: 'Standard lawn mowing service',
        basePrice: 50.00,
        priceUnit: 'visit',
      },
    }),
    prisma.service.upsert({
      where: { code: 'LAWN_EDGE' },
      update: {},
      create: {
        code: 'LAWN_EDGE',
        name: 'Lawn Edging',
        category: 'Lawn Care',
        description: 'Edge trimming around walkways and driveways',
        basePrice: 25.00,
        priceUnit: 'visit',
      },
    }),
    prisma.service.upsert({
      where: { code: 'LAWN_FERT' },
      update: {},
      create: {
        code: 'LAWN_FERT',
        name: 'Fertilization',
        category: 'Lawn Care',
        description: 'Lawn fertilization treatment',
        basePrice: 75.00,
        priceUnit: 'treatment',
      },
    }),
    prisma.service.upsert({
      where: { code: 'TREE_TRIM' },
      update: {},
      create: {
        code: 'TREE_TRIM',
        name: 'Tree Trimming',
        category: 'Tree Care',
        description: 'Professional tree trimming service',
        basePrice: 150.00,
        priceUnit: 'hour',
      },
    }),
  ]);

  console.log(`✅ Created ${services.length} services`);

  // Create sample customer
  const customer = await prisma.customer.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      name: 'John Smith',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'Smith Residence',
      nickname: ['John', 'Johnny', 'the Smith house'],
      addressLine1: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      defaultRate: 50.00,
      paymentTerms: 'NET30',
      tags: ['residential', 'weekly'],
    },
  });

  console.log(`✅ Created customer: ${customer.name}`);

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
