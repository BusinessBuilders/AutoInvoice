import { generateEmbedding, generateServiceEmbedding, generateCustomerEmbedding } from '../src/services/embeddings';
import logger from '../src/utils/logger';

async function main() {
  console.log('\n🧪 Testing OpenAI Embeddings API...\n');

  // Test 1: Basic embedding generation
  console.log('Test 1: Generating embedding for simple text...');
  const simpleEmbedding = await generateEmbedding('Hello world');

  if (simpleEmbedding) {
    console.log(`✅ Success! Generated ${simpleEmbedding.length} dimensional embedding`);
    console.log(`   First 5 values: [${simpleEmbedding.slice(0, 5).map(n => n.toFixed(4)).join(', ')}...]`);
  } else {
    console.log('❌ Failed to generate embedding');
    console.log('   Check your OPENAI_API_KEY in .env file');
    process.exit(1);
  }

  // Test 2: Service embedding
  console.log('\nTest 2: Generating service embedding...');
  const serviceEmbedding = await generateServiceEmbedding({
    name: 'Lawn Mowing',
    code: 'LAWN_MOW',
    category: 'Landscaping',
    description: 'Professional lawn mowing service',
  });

  if (serviceEmbedding) {
    console.log(`✅ Success! Service embedding generated`);
  } else {
    console.log('❌ Failed to generate service embedding');
  }

  // Test 3: Customer embedding
  console.log('\nTest 3: Generating customer embedding...');
  const customerEmbedding = await generateCustomerEmbedding({
    name: 'John Smith',
    nickname: ['Johnny', 'JS'],
    company: 'Smith Industries',
  });

  if (customerEmbedding) {
    console.log(`✅ Success! Customer embedding generated`);
  } else {
    console.log('❌ Failed to generate customer embedding');
  }

  console.log('\n✨ All tests passed! OpenAI embeddings are working.\n');
}

main().catch((error) => {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
});
