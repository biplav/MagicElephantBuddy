// Test script for Phase 1 Memory Service
import { memoryService, MemoryType } from './memory-service';

async function testMemoryService() {
  console.log('🧠 Testing Memory Service Phase 1...');
  
  try {
    // Test 1: Create memories for a child
    console.log('\n📝 Creating test memories...');
    
    const memory1 = await memoryService.createMemory(
      1, 
      'Child loves dinosaurs and asks many questions about T-Rex',
      'conversational',
      { 
        conversationId: 1,
        concepts: ['dinosaurs', 'T-Rex'],
        emotionalTone: 'excited'
      }
    );
    console.log('✅ Created conversational memory:', memory1.id);

    const memory2 = await memoryService.createMemory(
      1,
      'Child successfully counted to 15 today, showing improved number recognition',
      'learning',
      {
        milestoneId: 1,
        concepts: ['counting', 'numbers'],
        learning_outcome: 'milestone_progress'
      }
    );
    console.log('✅ Created learning memory:', memory2.id);

    const memory3 = await memoryService.createMemory(
      1,
      'Child showed drawing of family with bright colors, very creative',
      'visual',
      {
        visual_objects: ['drawing', 'family', 'colors'],
        emotionalTone: 'proud'
      }
    );
    console.log('✅ Created visual memory:', memory3.id);

    // Test 2: Retrieve memories
    console.log('\n🔍 Retrieving memories...');
    
    const dinosaurMemories = await memoryService.retrieveMemories({
      query: 'dinosaur',
      childId: 1,
      limit: 5
    });
    console.log(`✅ Found ${dinosaurMemories.length} dinosaur-related memories`);

    const learningMemories = await memoryService.retrieveMemories({
      query: 'counting',
      childId: 1,
      type: 'learning',
      limit: 5
    });
    console.log(`✅ Found ${learningMemories.length} learning memories about counting`);

    // Test 3: Get child context
    console.log('\n👶 Getting child context...');
    
    const childContext = await memoryService.getChildContext(1);
    console.log('✅ Child context retrieved:');
    console.log(`   - Recent memories: ${childContext.recentMemories.length}`);
    console.log(`   - Active interests: ${childContext.activeInterests.join(', ')}`);
    console.log(`   - Relationship level: ${childContext.relationshipLevel}`);
    console.log(`   - Communication style: ${childContext.personalityProfile.communication_style}`);

    // Test 4: Generate insights
    console.log('\n💡 Generating memory insights...');
    
    const insights = await memoryService.generateMemoryInsights(1);
    console.log(`✅ Generated ${insights.length} insights`);
    insights.forEach(insight => {
      console.log(`   - ${insight.pattern}: ${insight.description}`);
    });

    console.log('\n🎉 Memory Service Phase 1 tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Memory service test failed:', error);
  }
}

// Run the test
testMemoryService();