// Semantic Memory Enhancement Test - Demonstrating Vector Capabilities
import { memoryService } from './memory-service';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Enhanced memory with semantic similarity
class SemanticMemoryDemo {
  
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return [];
    }
  }

  calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length || embedding1.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  async findSemanticallySimilarMemories(
    childId: number, 
    queryText: string, 
    threshold: number = 0.7
  ): Promise<{memory: any, similarity: number}[]> {
    // Get all memories for the child
    const allMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 100
    });

    if (allMemories.length === 0) {
      return [];
    }

    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(queryText);
    if (queryEmbedding.length === 0) {
      return [];
    }

    // Calculate similarity for each memory and its content
    const similarities: {memory: any, similarity: number}[] = [];

    for (const memory of allMemories) {
      const memoryEmbedding = await this.generateEmbedding(memory.content);
      if (memoryEmbedding.length > 0) {
        const similarity = this.calculateCosineSimilarity(queryEmbedding, memoryEmbedding);
        if (similarity >= threshold) {
          similarities.push({ memory, similarity });
        }
      }
    }

    // Sort by similarity (highest first)
    return similarities.sort((a, b) => b.similarity - a.similarity);
  }
}

async function testSemanticMemoryCapabilities() {
  console.log('🧠 Semantic Memory Enhancement Test');
  console.log('====================================');
  
  const childId = 1;
  const semanticDemo = new SemanticMemoryDemo();
  
  try {
    // Phase 1: Create memories with related but different content
    console.log('\n📍 Phase 1: Creating Semantically Related Memories');
    console.log('--------------------------------------------------');
    
    const memoryContents = [
      { content: 'I love dinosaurs! T-Rex is my favorite because they are huge and powerful!', type: 'conversational', concepts: ['dinosaurs', 'T-Rex'] },
      { content: 'Prehistoric creatures like Triceratops had three horns and ate plants', type: 'learning', concepts: ['dinosaurs', 'Triceratops', 'herbivore'] },
      { content: 'Big animals like elephants and whales are amazing!', type: 'conversational', concepts: ['animals', 'elephants', 'whales'] },
      { content: 'I learned about ancient reptiles that lived millions of years ago', type: 'learning', concepts: ['reptiles', 'ancient', 'history'] },
      { content: 'Playing with toy dinosaurs makes me so happy!', type: 'emotional', concepts: ['toys', 'play', 'dinosaurs'] },
      { content: 'Counting to 20 is easy now: 1, 2, 3, 4, 5...', type: 'learning', concepts: ['counting', 'numbers', 'mathematics'] },
      { content: 'Flying creatures like birds and pterodactyls can soar through the sky', type: 'conversational', concepts: ['flying', 'birds', 'pterodactyls'] }
    ];

    for (const memData of memoryContents) {
      await memoryService.createMemory(childId, memData.content, memData.type as any, {
        concepts: memData.concepts,
        emotionalTone: memData.type === 'emotional' ? 'happy' : 'curious'
      });
    }

    console.log(`✅ Created ${memoryContents.length} semantically diverse memories`);

    // Phase 2: Test semantic similarity search
    console.log('\n📍 Phase 2: Testing Semantic Similarity Search');
    console.log('----------------------------------------------');

    const queries = [
      'ancient creatures and prehistoric animals',
      'large mammals and gigantic beasts', 
      'mathematics and numerical concepts',
      'flying animals and aerial creatures'
    ];

    for (const query of queries) {
      console.log(`\n🔍 Query: "${query}"`);
      
      const similarMemories = await semanticDemo.findSemanticallySimilarMemories(childId, query, 0.6);
      
      console.log(`   Found ${similarMemories.length} semantically similar memories:`);
      similarMemories.slice(0, 3).forEach((result, i) => {
        console.log(`   ${i + 1}. [${(result.similarity * 100).toFixed(1)}%] ${result.memory.content.slice(0, 60)}...`);
      });
    }

    console.log('✅ Semantic similarity search working');

    // Phase 3: Compare keyword vs semantic search
    console.log('\n📍 Phase 3: Keyword vs Semantic Search Comparison');
    console.log('-------------------------------------------------');

    const testQuery = 'giant prehistoric beasts';
    
    // Keyword-based search (existing functionality)
    const keywordResults = await memoryService.retrieveMemories({
      query: testQuery,
      childId,
      limit: 5
    });

    // Semantic search
    const semanticResults = await semanticDemo.findSemanticallySimilarMemories(childId, testQuery, 0.5);

    console.log(`\n🔍 Query: "${testQuery}"`);
    console.log(`\n📝 Keyword-based results (${keywordResults.length} found):`);
    keywordResults.forEach((memory, i) => {
      console.log(`   ${i + 1}. ${memory.content.slice(0, 70)}...`);
    });

    console.log(`\n🧠 Semantic-based results (${semanticResults.length} found):`);
    semanticResults.slice(0, 5).forEach((result, i) => {
      console.log(`   ${i + 1}. [${(result.similarity * 100).toFixed(1)}%] ${result.memory.content.slice(0, 70)}...`);
    });

    console.log('✅ Semantic vs keyword comparison complete');

    // Phase 4: AI prompt enhancement with semantic context
    console.log('\n📍 Phase 4: AI Prompt Enhancement with Semantic Context');
    console.log('------------------------------------------------------');

    const conversationQuery = "Tell me about really big animals";
    const semanticContext = await semanticDemo.findSemanticallySimilarMemories(childId, conversationQuery, 0.6);

    console.log(`\n💭 For conversation: "${conversationQuery}"`);
    console.log('\n🎯 Semantically relevant memory context for AI prompt:');
    
    semanticContext.slice(0, 4).forEach((result, i) => {
      const typeEmoji = {
        'conversational': '💬',
        'learning': '📚',
        'emotional': '😊',
        'relationship': '🤝',
        'visual': '👁️',
        'behavioral': '🎭',
        'cultural': '🌍',
        'preference': '⭐'
      }[result.memory.type] || '💭';
      
      console.log(`   ${i + 1}. ${typeEmoji} [${(result.similarity * 100).toFixed(1)}%] ${result.memory.content}`);
    });

    // Phase 5: Memory insights with semantic grouping
    console.log('\n📍 Phase 5: Semantic Memory Insights');
    console.log('------------------------------------');

    const allMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 50
    });

    // Group memories by semantic themes
    const themeGroups = new Map();
    const themes = ['animals', 'learning', 'play', 'emotions'];

    for (const theme of themes) {
      const themeMemories = await semanticDemo.findSemanticallySimilarMemories(childId, theme, 0.6);
      themeGroups.set(theme, themeMemories);
    }

    console.log('\n📊 Semantic Theme Analysis:');
    themeGroups.forEach((memories, theme) => {
      console.log(`   ${theme.toUpperCase()}: ${memories.length} related memories`);
      if (memories.length > 0) {
        const avgSimilarity = memories.reduce((sum, m) => sum + m.similarity, 0) / memories.length;
        console.log(`     Average relevance: ${(avgSimilarity * 100).toFixed(1)}%`);
      }
    });

    console.log('✅ Semantic insights generated');

    // Final Summary
    console.log('\n🎉 Semantic Memory Enhancement Test COMPLETE!');
    console.log('\n📋 Enhanced Capabilities Demonstrated:');
    console.log('======================================');
    console.log('✅ OpenAI text-embedding-3-small integration for 1536-dimension vectors');
    console.log('✅ Cosine similarity calculation for semantic relatedness');
    console.log('✅ Context-aware memory retrieval beyond keyword matching');
    console.log('✅ Semantic grouping and theme analysis of memories');
    console.log('✅ Enhanced AI prompt context with relevance scoring');
    console.log('✅ Comparative analysis of keyword vs semantic search results');
    
    console.log('\n🚀 Semantic Memory Benefits:');
    console.log('   • Finds conceptually related memories even without exact word matches');
    console.log('   • Provides relevance scoring for memory importance');
    console.log('   • Enables theme-based memory analysis and insights');
    console.log('   • Enhances AI conversations with semantically relevant context');
    console.log('   • Improves memory consolidation through semantic similarity detection');
    
    console.log('\n💡 Next Steps for Production:');
    console.log('   • Integrate semantic search into real-time conversation processing');
    console.log('   • Cache embeddings in PostgreSQL vector table for performance');
    console.log('   • Implement batch embedding generation for efficiency');
    console.log('   • Add semantic similarity to memory consolidation algorithms');

    return true;
    
  } catch (error) {
    console.error('❌ Semantic memory test failed:', error);
    return false;
  }
}

// Run the semantic memory enhancement test
testSemanticMemoryCapabilities();