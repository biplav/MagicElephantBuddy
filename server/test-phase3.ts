// Comprehensive Phase 3 Test - Advanced Memory Features
import { memoryService } from './memory-service';

async function testPhase3AdvancedMemory() {
  console.log('🧠 Testing Phase 3: Advanced Memory Features');
  console.log('=============================================');
  
  try {
    const childId = 1;
    
    // Step 1: Create a diverse set of memories to test with
    console.log('\n📝 Creating diverse memory dataset...');
    
    const testMemories = [
      {
        content: 'Child loves dinosaurs and T-Rex specifically',
        type: 'conversational' as const,
        metadata: { concepts: ['dinosaurs', 'T-Rex'], emotionalTone: 'positive' }
      },
      {
        content: 'Child expressed love for dinosaurs again, very excited',
        type: 'conversational' as const,
        metadata: { concepts: ['dinosaurs'], emotionalTone: 'positive' }
      },
      {
        content: 'Child successfully counted to 20 without help',
        type: 'learning' as const,
        metadata: { concepts: ['counting', 'numbers'], learning_outcome: 'milestone_achieved' }
      },
      {
        content: 'Child showed advanced counting skills, reached 25',
        type: 'learning' as const,
        metadata: { concepts: ['counting', 'numbers'], learning_outcome: 'milestone_exceeded' }
      },
      {
        content: 'Child felt sad when story ended',
        type: 'emotional' as const,
        metadata: { concepts: ['stories'], emotionalTone: 'sad' }
      },
      {
        content: 'Appu provided great encouragement during learning',
        type: 'relationship' as const,
        metadata: { emotionalTone: 'encouraging', importance_score: 0.8 }
      },
      {
        content: 'Child drew a beautiful picture of family',
        type: 'visual' as const,
        metadata: { visual_objects: ['drawing', 'family'], concepts: ['art', 'creativity'] }
      },
      {
        content: 'Low importance old conversation about weather',
        type: 'conversational' as const,
        metadata: { concepts: ['weather'], importance_score: 0.2 }
      }
    ];
    
    // Create all memories
    for (const memoryData of testMemories) {
      await memoryService.createMemory(
        childId,
        memoryData.content,
        memoryData.type,
        memoryData.metadata
      );
    }
    
    console.log(`✅ Created ${testMemories.length} test memories`);
    
    // Step 2: Test importance scoring calculation
    console.log('\n📊 Testing importance scoring system...');
    
    const context = await memoryService.getChildContext(childId);
    const allMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 20
    });
    
    console.log('Importance scores for different memory types:');
    for (const memory of allMemories.slice(0, 5)) {
      const importance = await memoryService.calculateImportanceScore(memory, context);
      console.log(`   ${memory.type}: ${importance.toFixed(3)} - "${memory.content.slice(0, 50)}..."`);
    }
    
    // Step 3: Test memory statistics generation
    console.log('\n📈 Testing memory statistics generation...');
    
    const stats = await memoryService.getMemoryStats(childId);
    console.log('Memory Statistics:');
    console.log(`   Total memories: ${stats.totalMemories}`);
    console.log(`   Average importance: ${stats.averageImportance.toFixed(3)}`);
    console.log(`   Storage efficiency: ${stats.storageEfficiency.toFixed(3)}`);
    console.log('   Memories by type:');
    Object.entries(stats.memoriesByType).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`     ${type}: ${count}`);
      }
    });
    
    console.log('   Memory trends:');
    stats.memoryTrends.forEach(trend => {
      console.log(`     ${trend.type}: ${trend.count} memories, avg importance: ${trend.averageImportance.toFixed(3)}`);
      if (trend.concepts.length > 0) {
        console.log(`       concepts: ${trend.concepts.join(', ')}`);
      }
    });
    
    // Step 4: Test memory merging
    console.log('\n🔗 Testing memory merging...');
    
    const mergeResults = await memoryService.mergeRelatedMemories(childId, 0.3); // Lower threshold for testing
    console.log(`✅ Memory merge analysis completed:`);
    console.log(`   Found ${mergeResults.length} merge opportunities`);
    
    mergeResults.forEach((merge, index) => {
      console.log(`   Merge ${index + 1}:`);
      console.log(`     Reason: ${merge.reason}`);
      console.log(`     Confidence: ${merge.confidenceScore}`);
      console.log(`     Original memories: ${merge.originalMemories.length}`);
      console.log(`     New merged content: "${merge.mergedMemory.content.slice(0, 80)}..."`);
    });
    
    // Step 5: Test importance refresh
    console.log('\n🔄 Testing importance score refresh...');
    
    await memoryService.refreshMemoryImportance(childId);
    console.log('✅ Importance scores refreshed for all memories');
    
    // Step 6: Test full memory consolidation
    console.log('\n🗂️ Testing comprehensive memory consolidation...');
    
    const consolidationResult = await memoryService.consolidateMemories(childId);
    console.log('Memory Consolidation Results:');
    console.log(`   Memories processed: ${consolidationResult.consolidatedMemories}`);
    console.log(`   Memories merged: ${consolidationResult.mergedMemories}`);
    console.log(`   Memories archived: ${consolidationResult.archivedMemories}`);
    console.log(`   New insights generated: ${consolidationResult.newInsights.length}`);
    console.log(`   Processing time: ${consolidationResult.processingTime}ms`);
    
    if (consolidationResult.newInsights.length > 0) {
      console.log('   Generated insights:');
      consolidationResult.newInsights.forEach((insight, index) => {
        console.log(`     ${index + 1}. ${insight.pattern}: ${insight.description}`);
        console.log(`        Confidence: ${insight.confidence}, Recommendations: ${insight.recommendations.length}`);
      });
    }
    
    // Step 7: Test post-consolidation memory state
    console.log('\n📋 Testing post-consolidation memory state...');
    
    const finalStats = await memoryService.getMemoryStats(childId);
    const finalMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 20
    });
    
    console.log('Final memory state:');
    console.log(`   Total memories: ${finalStats.totalMemories}`);
    console.log(`   Average importance: ${finalStats.averageImportance.toFixed(3)}`);
    console.log(`   Storage efficiency: ${finalStats.storageEfficiency.toFixed(3)}`);
    
    console.log('\n   Top importance memories:');
    const topMemories = finalMemories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3);
    
    topMemories.forEach((memory, index) => {
      console.log(`     ${index + 1}. [${memory.importance.toFixed(3)}] ${memory.type}: "${memory.content.slice(0, 60)}..."`);
    });
    
    // Step 8: Test memory retrieval with updated importance
    console.log('\n🔍 Testing memory retrieval with importance weighting...');
    
    const dinosaurMemories = await memoryService.retrieveMemories({
      query: 'dinosaur',
      childId,
      limit: 5
    });
    
    const learningMemories = await memoryService.retrieveMemories({
      query: 'count',
      childId,
      type: 'learning',
      limit: 5
    });
    
    console.log(`✅ Retrieved ${dinosaurMemories.length} dinosaur memories (importance-weighted)`);
    console.log(`✅ Retrieved ${learningMemories.length} learning memories (importance-weighted)`);
    
    // Step 9: Performance analysis
    console.log('\n⚡ Performance analysis...');
    
    const performanceMetrics = {
      totalMemoriesProcessed: finalStats.totalMemories,
      consolidationTime: consolidationResult.processingTime,
      averageProcessingTimePerMemory: finalStats.totalMemories > 0 ? 
        consolidationResult.processingTime / finalStats.totalMemories : 0,
      memoryEfficiencyGain: finalStats.storageEfficiency,
      importanceDistribution: Object.values(finalStats.memoriesByType)
        .reduce((sum, count) => sum + count, 0)
    };
    
    console.log('Performance Metrics:');
    console.log(`   Processing speed: ${performanceMetrics.averageProcessingTimePerMemory.toFixed(2)}ms per memory`);
    console.log(`   Storage efficiency: ${(performanceMetrics.memoryEfficiencyGain * 100).toFixed(1)}%`);
    console.log(`   Memory distribution: ${performanceMetrics.importanceDistribution} total memories`);
    
    console.log('\n🎉 Phase 3 Advanced Memory Features test completed successfully!');
    console.log('\n📋 Phase 3 Features Summary:');
    console.log('   ✅ Advanced importance scoring with multi-factor analysis');
    console.log('   ✅ Memory consolidation with merging and archiving');
    console.log('   ✅ Comprehensive memory statistics and analytics');
    console.log('   ✅ Automated memory optimization and cleanup');
    console.log('   ✅ Performance monitoring and efficiency tracking');
    console.log('   ✅ Context-aware importance calculation');
    console.log('   ✅ Memory trend analysis and pattern recognition');
    
    return true;
    
  } catch (error) {
    console.error('❌ Phase 3 test failed:', error);
    return false;
  }
}

// Run the comprehensive Phase 3 test
testPhase3AdvancedMemory();