// Test Official Mem0 Service Integration
import { mem0Service } from './mem0-service';

async function testMem0Integration() {
  console.log('🚀 Testing Official Mem0 Service Integration');
  console.log('===========================================');
  
  // Check if service is configured
  console.log('\n📍 Configuration Status:');
  console.log(`Service configured: ${mem0Service.isReady()}`);
  console.log(`Console URL: ${mem0Service.getConsoleUrl()}`);
  
  if (!mem0Service.isReady()) {
    console.log('\n⚠️ Mem0 service not configured with API key');
    console.log('To use the official Mem0 service:');
    console.log('1. Sign up at https://mem0.ai');
    console.log('2. Get your API key from the dashboard');
    console.log('3. Set the MEM0_API_KEY environment variable');
    console.log('4. View memories at: https://app.mem0.ai/');
    console.log('\n💡 The service will work in fallback mode (logs only)');
  }
  
  // Test memory operations (will work regardless of API key status)
  const testUserId = 'child_1';
  const testMemory = 'The child loves dinosaurs and asked about T-Rex facts';
  const testQuery = 'dinosaur';
  
  console.log('\n📍 Testing Memory Operations:');
  console.log('------------------------------');
  
  // Add memory
  console.log(`\n1. Adding memory: "${testMemory}"`);
  const addResult = await mem0Service.addMemory(testMemory, testUserId, {
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
  const searchResults = await mem0Service.searchMemories(testQuery, testUserId, 5);
  console.log(`Found ${searchResults.length} matching memories`);
  
  if (searchResults.length > 0) {
    searchResults.forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.memory} (score: ${result.score})`);
    });
  }
  
  // Get all memories
  console.log(`\n3. Getting all memories for user: ${testUserId}`);
  const allMemories = await mem0Service.getAllMemories(testUserId);
  console.log(`Total memories: ${allMemories.length}`);
  
  if (allMemories.length > 0) {
    console.log('Recent memories:');
    allMemories.slice(0, 3).forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.memory}`);
    });
  }
  
  console.log('\n🎉 Mem0 Integration Test Complete!');
  
  if (mem0Service.isReady()) {
    console.log('\n✅ Official Mem0 service is ready to use');
    console.log('Visit the console to view memories: https://app.mem0.ai/');
  } else {
    console.log('\n💡 To enable full functionality:');
    console.log('   - Get API key from: https://mem0.ai');
    console.log('   - Set MEM0_API_KEY environment variable');
    console.log('   - Restart the application');
  }
}

// Run the test
testMem0Integration().catch(console.error);