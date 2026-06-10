import { prisma } from '../src/utils/db';

async function main() {
  try {
    const result = await prisma.$queryRaw<any[]>`
      SELECT * FROM pg_extension WHERE extname = 'vector';
    `;

    if (result.length > 0) {
      console.log('✓ pgvector extension is installed');
    } else {
      console.log('✗ pgvector extension NOT installed');
      console.log('\nTo install pgvector:');
      console.log('1. Run: CREATE EXTENSION vector;');
      console.log('2. Or install pgvector package first if not available');
    }
  } catch (error: any) {
    console.error('Error checking pgvector:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
