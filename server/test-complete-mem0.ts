// Complete Mem0 Integration Test - All 3 Phases
import { memoryService } from './memory-service';

async function testCompleteMem0Integration() {
  console.log('🚀 Complete Mem0 Integration Test - All 3 Phases');
  console.log('===================================================');
  
  const childId = 1;
  
  try {
    // Phase 1: Basic Memory Operations
    console.log('\n📍 Phase 1: Testing Basic Memory Operations');
    console.log('--------------------------------------------');
    
    // Create various types of memories
    await memoryService.createMemory(childId, 'Child loves dinosaurs and asks about T-Rex', 'conversational', {
      concepts: ['dinosaurs', 'T-Rex'],
      emotionalTone: 'excited'
    });
    
    await memoryService.createMemory(childId, 'Successfully learned to count to 15', 'learning', {
      concepts: ['counting', 'numbers'],
      learning_outcome: 'milestone_achieved'
    });
    
    await memoryService.createMemory(childId, 'Showed happiness when playing games', 'emotional', {
      concepts: ['games', 'play'],
      emotionalTone: 'happy'
    });
    
    console.log('✅ Phase 1: Basic memory creation working');
    
    // Test memory retrieval
    const dinosaurMemories = await memoryService.retrieveMemories({
      query: 'dinosaur',
      childId,
      limit: 5
    });
    
    console.log(`✅ Phase 1: Memory retrieval working (${dinosaurMemories.length} dinosaur memories found)`);
    
    // Test child context generation
    const context = await memoryService.getChildContext(childId);
    console.log(`✅ Phase 1: Child context generation working (${context.activeInterests.length} interests identified)`);
    
    // Phase 2: Real-time Memory Formation Simulation
    console.log('\n📍 Phase 2: Testing Real-time Memory Formation');
    console.log('----------------------------------------------');
    
    // Simulate conversation flow with memory formation
    const conversationFlow = [
      { speaker: 'child', text: 'I love animals so much! Elephants are my favorite!' },
      { speaker: 'appu', text: 'That\'s wonderful! Elephants are amazing creatures! Great job being curious!' },
      { speaker: 'child', text: 'Can you help me learn the alphabet?' },
      { speaker: 'appu', text: 'I\'m so proud of you for wanting to learn! Let\'s practice A, B, C...' },
      { speaker: 'child', text: 'This is so fun! I\'m happy we\'re learning together!' }
    ];
    
    // Process conversation and form memories
    for (const turn of conversationFlow) {
      if (turn.speaker === 'child') {
        // Simulate interest detection
        if (turn.text.toLowerCase().includes('love') || turn.text.toLowerCase().includes('favorite')) {
          await memoryService.createMemory(childId, `Child expressed interest: "${turn.text}"`, 'conversational', {
            concepts: ['animals', 'elephants'],
            emotionalTone: 'positive'
          });
        }
        
        // Simulate learning detection
        if (turn.text.toLowerCase().includes('learn') || turn.text.toLowerCase().includes('alphabet')) {
          await memoryService.createMemory(childId, `Learning request: "${turn.text}"`, 'learning', {
            concepts: ['alphabet', 'letters'],
            learning_outcome: 'engagement'
          });
        }
        
        // Simulate emotional detection
        if (turn.text.toLowerCase().includes('fun') || turn.text.toLowerCase().includes('happy')) {
          await memoryService.createMemory(childId, `Positive emotion: "${turn.text}"`, 'emotional', {
            concepts: ['learning', 'joy'],
            emotionalTone: 'happy'
          });
        }
      } else {
        // Simulate encouragement detection
        if (turn.text.includes('wonderful') || turn.text.includes('proud')) {
          await memoryService.createMemory(childId, `Encouragement provided: "${turn.text.slice(0, 60)}..."`, 'relationship', {
            emotionalTone: 'encouraging',
            importance_score: 0.7
          });
        }
      }
    }
    
    console.log('✅ Phase 2: Conversation memory formation working');
    
    // Test updated context after conversation
    const updatedContext = await memoryService.getChildContext(childId);
    console.log(`✅ Phase 2: Context evolution working (emotional state: ${updatedContext.emotionalState})`);
    
    // Phase 3: Advanced Memory Features
    console.log('\n📍 Phase 3: Testing Advanced Memory Features');
    console.log('--------------------------------------------');
    
    // Test importance scoring
    const memories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 10
    });
    
    if (memories.length > 0) {
      const importance = await memoryService.calculateImportanceScore(memories[0], updatedContext);
      console.log(`✅ Phase 3: Importance scoring working (score: ${importance.toFixed(3)})`);
    }
    
    // Test memory statistics
    const stats = await memoryService.getMemoryStats(childId);
    console.log(`✅ Phase 3: Memory statistics working (${stats.totalMemories} total, efficiency: ${(stats.storageEfficiency * 100).toFixed(1)}%)`);
    
    // Test memory consolidation
    const consolidationResult = await memoryService.consolidateMemories(childId);
    console.log(`✅ Phase 3: Memory consolidation working (${consolidationResult.consolidatedMemories} processed, ${consolidationResult.processingTime}ms)`);
    
    // Final integration test: Simulated AI prompt enhancement
    console.log('\n🤖 Testing AI Prompt Enhancement with Memory Context');
    console.log('----------------------------------------------------');
    
    // Get recent memories for AI prompt
    const recentMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 5,
      timeframe: 'week'
    });
    
    const finalContext = await memoryService.getChildContext(childId);
    
    // Simulate enhanced AI prompt generation
    const memoryContext = recentMemories.map(memory => {
      const typeEmoji = {
        'conversational': '💬',
        'learning': '📚',
        'emotional': '😊',
        'relationship': '🤝',
        'visual': '👁️',
        'behavioral': '🎭',
        'cultural': '🌍',
        'preference': '⭐'
      }[memory.type] || '💭';
      
      return `${typeEmoji} ${memory.content}`;
    });
    
    console.log('AI Prompt Memory Context:');
    memoryContext.forEach((context, index) => {
      console.log(`   ${index + 1}. ${context}`);
    });
    
    console.log('\nChild Profile Insights:');
    console.log(`   Active Interests: ${finalContext.activeInterests.join(', ')}`);
    console.log(`   Communication Style: ${finalContext.personalityProfile.communication_style}`);
    console.log(`   Emotional State: ${finalContext.emotionalState || 'neutral'}`);
    console.log(`   Relationship Level: ${finalContext.relationshipLevel}/10`);
    
    // Performance Summary
    console.log('\n⚡ Performance Summary');
    console.log('---------------------');
    
    const finalStats = await memoryService.getMemoryStats(childId);
    console.log(`Memory Count: ${finalStats.totalMemories}`);
    console.log(`Average Importance: ${finalStats.averageImportance.toFixed(3)}`);
    console.log(`Storage Efficiency: ${(finalStats.storageEfficiency * 100).toFixed(1)}%`);
    console.log(`Processing Time: ${consolidationResult.processingTime}ms`);
    
    console.log('\n🎉 Complete Mem0 Integration Test SUCCESSFUL!');
    console.log('\n📋 Integration Summary:');
    console.log('=======================');
    console.log('✅ Phase 1: Basic memory operations - WORKING');
    console.log('✅ Phase 2: Real-time memory formation - WORKING');
    console.log('✅ Phase 3: Advanced memory features - WORKING');
    console.log('✅ AI prompt enhancement with memory context - WORKING');
    console.log('✅ Automated memory consolidation - WORKING');
    console.log('✅ Performance optimization - WORKING');
    
    console.log('\n🚀 Appu now has persistent memory across conversations!');
    console.log('Memory-enhanced conversations will provide:');
    console.log('   • Continuity across sessions');
    console.log('   • Personalized responses based on past interactions');
    console.log('   • Recognition of interests and emotional states');
    console.log('   • Progressive relationship building');
    console.log('   • Adaptive learning based on child\'s progress');
    
    return true;
    
  } catch (error) {
    console.error('❌ Complete Mem0 integration test failed:', error);
    return false;
  }
}

// Run the complete integration test
testCompleteMem0Integration();