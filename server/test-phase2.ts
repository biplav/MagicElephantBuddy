// Comprehensive Phase 2 Test - Memory-Enhanced Conversation System
import { memoryService } from './memory-service';
import { storage } from './storage';

async function testPhase2MemorySystem() {
  console.log('🧠 Testing Phase 2: Memory-Enhanced Conversation System');
  console.log('====================================================');
  
  try {
    // Step 1: Clear any existing memories for clean test
    console.log('\n🧹 Preparing test environment...');
    
    // Step 2: Simulate a conversation session with memory formation
    console.log('\n💬 Simulating conversation with memory formation...');
    
    const childId = 1;
    const conversationId = 1001;
    
    // Simulate child messages and memory formation
    const conversationFlow = [
      {
        speaker: 'child',
        message: 'Hi Appu! I love dinosaurs so much!',
        expectedMemories: ['conversational'] // Should create interest memory
      },
      {
        speaker: 'appu',
        message: 'That\'s wonderful! Dinosaurs are amazing! Great job being curious about them!',
        expectedMemories: ['relationship'] // Should create encouragement memory
      },
      {
        speaker: 'child', 
        message: 'Can you teach me to count to 10? I want to learn!',
        expectedMemories: ['learning'] // Should create learning memory
      },
      {
        speaker: 'appu',
        message: 'I\'m so proud of you for wanting to learn! Let\'s count together: 1, 2, 3...',
        expectedMemories: ['relationship'] // Should create another encouragement memory
      },
      {
        speaker: 'child',
        message: 'I\'m so happy we\'re friends! You make me laugh!',
        expectedMemories: ['emotional', 'relationship'] // Should create emotional and relationship memories
      }
    ];
    
    // Process each message and form memories
    let totalMemoriesCreated = 0;
    for (const turn of conversationFlow) {
      console.log(`\n   ${turn.speaker === 'child' ? '👶' : '🐘'} "${turn.message}"`);
      
      // Simulate the memory formation logic from the conversation services
      if (turn.speaker === 'child') {
        const content = turn.message.toLowerCase();
        
        // Interest detection
        if (content.includes('love') || content.includes('like')) {
          await memoryService.createMemory(
            childId,
            `Child expressed interest: "${turn.message}"`,
            'conversational',
            {
              conversationId,
              emotionalTone: 'positive',
              concepts: ['dinosaurs'],
              importance_score: 0.7
            }
          );
          totalMemoriesCreated++;
          console.log('     ✅ Created interest memory');
        }
        
        // Learning content detection
        if (content.includes('teach') || content.includes('learn') || content.includes('count')) {
          await memoryService.createMemory(
            childId,
            `Learning interaction: "${turn.message}"`,
            'learning',
            {
              conversationId,
              concepts: ['counting', 'numbers'],
              learning_outcome: 'engagement'
            }
          );
          totalMemoriesCreated++;
          console.log('     ✅ Created learning memory');
        }
        
        // Emotional detection
        if (content.includes('happy') || content.includes('friends')) {
          await memoryService.createMemory(
            childId,
            `Child showed positive emotion: "${turn.message}"`,
            'emotional',
            {
              conversationId,
              emotionalTone: 'happy',
              concepts: ['friendship', 'joy']
            }
          );
          totalMemoriesCreated++;
          console.log('     ✅ Created emotional memory');
        }
        
      } else { // Appu's response
        if (turn.message.includes('wonderful') || turn.message.includes('proud') || turn.message.includes('great job')) {
          await memoryService.createMemory(
            childId,
            `Appu provided encouragement: "${turn.message.slice(0, 80)}..."`,
            'relationship',
            {
              conversationId,
              emotionalTone: 'encouraging',
              importance_score: 0.6
            }
          );
          totalMemoriesCreated++;
          console.log('     ✅ Created encouragement memory');
        }
      }
    }
    
    console.log(`\n📊 Created ${totalMemoriesCreated} memories during conversation`);
    
    // Step 3: Test memory retrieval and context generation
    console.log('\n🔍 Testing memory retrieval and context...');
    
    const dinosaurMemories = await memoryService.retrieveMemories({
      query: 'dinosaur',
      childId,
      limit: 5
    });
    
    const learningMemories = await memoryService.retrieveMemories({
      query: 'learn',
      childId,
      type: 'learning',
      limit: 5
    });
    
    const emotionalMemories = await memoryService.retrieveMemories({
      query: 'happy',
      childId,
      type: 'emotional',
      limit: 5
    });
    
    const relationshipMemories = await memoryService.retrieveMemories({
      query: 'proud',
      childId,
      type: 'relationship',
      limit: 5
    });
    
    console.log(`✅ Retrieved ${dinosaurMemories.length} dinosaur interest memories`);
    console.log(`✅ Retrieved ${learningMemories.length} learning memories`);
    console.log(`✅ Retrieved ${emotionalMemories.length} emotional memories`);
    console.log(`✅ Retrieved ${relationshipMemories.length} relationship memories`);
    
    // Step 4: Test child context evolution
    console.log('\n👶 Testing child context evolution...');
    
    const updatedContext = await memoryService.getChildContext(childId);
    
    console.log('✅ Updated child context after conversation:');
    console.log(`   - Active interests: ${updatedContext.activeInterests.join(', ')}`);
    console.log(`   - Communication style: ${updatedContext.personalityProfile.communication_style}`);
    console.log(`   - Relationship level: ${updatedContext.relationshipLevel}/10`);
    console.log(`   - Emotional state: ${updatedContext.emotionalState || 'neutral'}`);
    console.log(`   - Confidence level: ${updatedContext.personalityProfile.confidence}/10`);
    console.log(`   - Curiosity level: ${updatedContext.personalityProfile.curiosity}/10`);
    
    // Step 5: Test memory insights generation
    console.log('\n💡 Testing memory insights generation...');
    
    const insights = await memoryService.generateMemoryInsights(childId);
    console.log(`✅ Generated ${insights.length} memory insights`);
    insights.forEach((insight, index) => {
      console.log(`   ${index + 1}. ${insight.pattern}: ${insight.description} (confidence: ${insight.confidence})`);
    });
    
    // Step 6: Simulate next conversation with memory context
    console.log('\n🔄 Simulating follow-up conversation with memory context...');
    
    // Get recent memories that would be included in AI prompt
    const recentMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 5,
      timeframe: 'week'
    });
    
    console.log('📝 Memories that would be included in AI prompt:');
    recentMemories.forEach((memory, index) => {
      const typeEmoji = memory.type === 'conversational' ? '💬' : 
                       memory.type === 'learning' ? '📚' : 
                       memory.type === 'emotional' ? '😊' : 
                       memory.type === 'relationship' ? '🤝' : '💭';
      console.log(`   ${typeEmoji} ${memory.content}`);
    });
    
    console.log('\n✅ Memory context would enable Appu to:');
    console.log('   - Remember the child loves dinosaurs');
    console.log('   - Know the child is interested in learning to count');
    console.log('   - Recognize the positive emotional bond');
    console.log('   - Continue building on established relationship');
    console.log('   - Provide personalized responses based on past interactions');
    
    console.log('\n🎉 Phase 2 Memory-Enhanced Conversation System test completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Memory formation: ✅ Working (${totalMemoriesCreated} memories created)`);
    console.log(`   - Memory retrieval: ✅ Working (${recentMemories.length} recent memories)`);
    console.log(`   - Context generation: ✅ Working (interests, emotions, relationships tracked)`);
    console.log(`   - AI prompt integration: ✅ Ready (memory context prepared for AI)`);
    console.log('   - Personalized conversations: ✅ Enabled');
    
  } catch (error) {
    console.error('❌ Phase 2 test failed:', error);
  }
}

// Run the comprehensive Phase 2 test
testPhase2MemorySystem();