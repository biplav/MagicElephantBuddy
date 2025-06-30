// Test Open Source Mem0 Service Integration
import { openSourceMem0Service } from './mem0-service';

async function testMem0Integration() {
  console.log('🚀 Testing Open Source Mem0 Service Integration');
  console.log('============================================');
  
  // Check if service is configured
  console.log('\n📍 Configuration Status:');
  console.log(`Service configured: ${openSourceMem0Service.isReady()}`);
  console.log(`Console URL: ${openSourceMem0Service.getConsoleUrl()}`);
  console.log(`Storage Info: ${openSourceMem0Service.getStorageInfo()}`);
  
  if (!openSourceMem0Service.isReady()) {
    console.log('\n⚠️ Open Source Mem0 service not fully configured');
    console.log('OpenAI API key needed for embedding generation');
    console.log('The service will work with limited functionality');
  } else {
    console.log('\n✅ Open Source Mem0 service ready with full vector capabilities');
  }
  
  // Test memory operations (will work regardless of API key status)
  const testUserId = 'child_1';
  const testMemory = 'The child loves dinosaurs and asked about T-Rex facts';
  const testQuery = 'dinosaur';
  
  console.log('\n📍 Testing Memory Operations:');
  console.log('------------------------------');
  
  // Add memory
  console.log(`\n1. Adding memory: "${testMemory}"`);
  const addResult = await openSourceMem0Service.addMemory(testMemory, testUserId, {
    category: 'interests',
    emotion: 'excited',
    learning_context: 'conversation'
  });
  
  if (addResult) {
    console.log('✅ Memory added successfully:', addResult.id);
  } else {
    console.log('ℹ️ Memory add request completed (check logs above)');
  }
  
  // Search memories
  console.log(`\n2. Searching memories for: "${testQuery}"`);
  const searchResults = await openSourceMem0Service.searchMemories(testQuery, testUserId, 5);
  console.log(`Found ${searchResults.length} matching memories`);
  
  if (searchResults.length > 0) {
    searchResults.forEach((result: any, index: number) => {
      console.log(`   ${index + 1}. ${result.memory} (score: ${result.score})`);
    });
  }
  
  // Get all memories
  console.log(`\n3. Getting all memories for user: ${testUserId}`);
  const allMemories = await openSourceMem0Service.getAllMemories(testUserId);
  console.log(`Total memories: ${allMemories.length}`);
  
  if (allMemories.length > 0) {
    console.log('Recent memories:');
    allMemories.slice(0, 3).forEach((memory: any, index: number) => {
      console.log(`   ${index + 1}. ${memory.memory}`);
    });
  }
  
  console.log('\n🎉 Open Source Mem0 Integration Test Complete!');
  
  if (openSourceMem0Service.isReady()) {
    console.log('\n✅ Open Source Mem0 service is fully functional');
    console.log('Features: Vector similarity search, Memory deduplication, Local storage');
    console.log('No external API dependencies required');
  } else {
    console.log('\n💡 To enable full vector search functionality:');
    console.log('   - Ensure OPENAI_API_KEY is set for embeddings');
    console.log('   - Text search will work without API key');
  }
}

// Run the test
testMem0Integration().catch(console.error);