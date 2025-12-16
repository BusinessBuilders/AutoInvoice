import { prisma } from '../src/utils/db';

async function main() {
  const services = await prisma.service.findMany({
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\nTotal services: ${services.length}\n`);

  services.forEach((service, i) => {
    console.log(`${i + 1}. ${service.name} (${service.code}) - ${service.category}`);
    console.log(`   Has embedding: ${service.embedding ? 'Yes' : 'No'}`);
    console.log(`   Created: ${service.createdAt}\n`);
  });

  await prisma.$disconnect();
}

main();
