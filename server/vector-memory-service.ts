// PostgreSQL Vector Memory Service with Semantic Similarity
import { OpenAI } from 'openai';
import { db } from './db';
import { memories, memoryConversationLinks, memoryChildContexts } from '@shared/schema';
import { eq, desc, sql, and, gt } from 'drizzle-orm';
import type { 
  Memory, 
  MemoryType, 
  MemoryMetadata, 
  ChildMemoryContext,
  MemoryQuery,
  PersonalityProfile,
  LearningStyle,
  MemoryInsight,
  ConsolidationResult,
  MemoryStatistics,
  MergeResult,
  IMemoryService
} from './memory-service';

interface DatabaseMemory {
  id: string;
  childId: number;
  content: string;
  type: MemoryType;
  importance: number;
  embedding: number[] | null;
  metadata: MemoryMetadata | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PostgreSQLVectorMemoryService implements IMemoryService {
  private openai: OpenAI;
  private memoryContextCache: Map<number, ChildMemoryContext> = new Map();
  private embeddingModel = 'text-embedding-3-small'; // 1536 dimensions
  
  constructor() {
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    console.log('Initialized PostgreSQL Vector Memory Service');
  }

  // Generate embedding for text content
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
        encoding_format: 'float',
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return new Array(1536).fill(0); // Return zero vector as fallback
    }
  }

  // Convert database memory to Memory interface
  private convertToMemory(dbMemory: DatabaseMemory): Memory {
    return {
      id: dbMemory.id,
      content: dbMemory.content,
      type: dbMemory.type,
      childId: dbMemory.childId,
      importance: dbMemory.importance,
      metadata: dbMemory.metadata || {},
      createdAt: dbMemory.createdAt,
      updatedAt: dbMemory.updatedAt,
    };
  }

  async createMemory(
    childId: number, 
    content: string, 
    type: MemoryType, 
    metadata: MemoryMetadata = {}
  ): Promise<Memory> {
    const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const importance = await this.calculateInitialImportance(content, type, metadata);
    const embedding = await this.generateEmbedding(content);
    
    const [insertedMemory] = await db
      .insert(memories)
      .values({
        id: memoryId,
        childId,
        content,
        type,
        importance,
        embedding,
        metadata,
      })
      .returning();

    console.log(`Created ${type} memory for child ${childId}: ${content.slice(0, 50)}...`);
    
    // Clear cache to force refresh
    this.memoryContextCache.delete(childId);
    
    return this.convertToMemory(insertedMemory as DatabaseMemory);
  }

  async retrieveMemories(query: MemoryQuery): Promise<Memory[]> {
    // Build where conditions
    let whereConditions = [eq(memories.childId, query.childId)];

    // Add type filter if specified
    if (query.type) {
      whereConditions.push(eq(memories.type, query.type));
    }

    // Add timeframe filter
    if (query.timeframe) {
      const now = new Date();
      let cutoffDate: Date;
      
      switch (query.timeframe) {
        case 'day':
          cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = new Date(0);
      }
      
      whereConditions.push(gt(memories.createdAt, cutoffDate));
    }

    let results = await db
      .select()
      .from(memories)
      .where(and(...whereConditions))
      .orderBy(desc(memories.importance), desc(memories.createdAt))
      .limit(query.limit || 10);

    // If there's a query string, perform semantic similarity search
    if (query.query && query.query.trim() !== '') {
      const queryEmbedding = await this.generateEmbedding(query.query);
      
      // Use pgvector cosine similarity
      const similarityResults = await db.execute(sql`
        SELECT *, 
               1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM ${memories}
        WHERE child_id = ${query.childId}
          ${query.type ? sql`AND type = ${query.type}` : sql``}
          ${query.timeframe ? this.getTimeframeSQL(query.timeframe) : sql``}
        ORDER BY similarity DESC, importance DESC, created_at DESC
        LIMIT ${query.limit || 10}
      `);

      // Type the raw results properly
      const typedResults = similarityResults.rows.map(row => ({
        id: row.id as string,
        childId: row.child_id as number,
        content: row.content as string,
        type: row.type as MemoryType,
        importance: (row.importance as number) || 0.5,
        embedding: row.embedding as number[] | null,
        metadata: row.metadata as MemoryMetadata | null,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
        similarity: row.similarity as number
      }));

      // Filter by similarity threshold if specified
      if (query.threshold && query.threshold > 0) {
        const filtered = typedResults.filter((row) => row.similarity >= query.threshold!);
        return filtered.map(this.convertToMemory);
      }
      
      return typedResults.map(this.convertToMemory);
    }

    return results.map(row => this.convertToMemory({
      id: row.id,
      childId: row.childId,
      content: row.content,
      type: row.type as MemoryType,
      importance: row.importance || 0.5,
      embedding: row.embedding,
      metadata: row.metadata as MemoryMetadata | null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private getTimeframeSQL(timeframe: string) {
    const now = new Date();
    let cutoffDate: Date;
    
    switch (timeframe) {
      case 'day':
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return sql``;
    }
    
    return sql`AND created_at > ${cutoffDate.toISOString()}`;
  }

  async updateMemoryImportance(memoryId: string, importance: number): Promise<void> {
    await db
      .update(memories)
      .set({ 
        importance,
        updatedAt: new Date()
      })
      .where(eq(memories.id, memoryId));
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await db
      .delete(memories)
      .where(eq(memories.id, memoryId));
  }

  async getChildContext(childId: number): Promise<ChildMemoryContext> {
    // Check cache first
    if (this.memoryContextCache.has(childId)) {
      return this.memoryContextCache.get(childId)!;
    }

    // Get recent memories for context generation
    const recentMemories = await this.retrieveMemories({
      query: '',
      childId,
      limit: 50,
      timeframe: 'month'
    });

    // Generate personality profile and learning style
    const personalityProfile = await this.generatePersonalityProfile(childId, recentMemories);
    const learningStyle = await this.generateLearningStyle(childId, recentMemories);
    const activeInterests = await this.extractActiveInterests(childId, recentMemories);
    const relationshipLevel = await this.calculateRelationshipLevel(childId, recentMemories);
    const emotionalState = await this.detectEmotionalState(childId, recentMemories);

    const context: ChildMemoryContext = {
      childId,
      recentMemories: recentMemories.slice(0, 10), // Keep top 10 most relevant
      personalityProfile,
      learningStyle,
      relationshipLevel,
      activeInterests,
      emotionalState
    };

    // Cache the context
    this.memoryContextCache.set(childId, context);

    return context;
  }

  async updateChildContext(childId: number, context: Partial<ChildMemoryContext>): Promise<void> {
    const currentContext = await this.getChildContext(childId);
    const updatedContext = { ...currentContext, ...context };
    this.memoryContextCache.set(childId, updatedContext);
  }

  async findSimilarMemories(childId: number, content: string, type?: MemoryType): Promise<Memory[]> {
    const queryEmbedding = await this.generateEmbedding(content);
    
    const similarityResults = await db.execute(sql`
      SELECT *, 
             1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM ${memories}
      WHERE child_id = ${childId}
        ${type ? sql`AND type = ${type}` : sql``}
        AND 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) > 0.7
      ORDER BY similarity DESC
      LIMIT 10
    `);

    return similarityResults.rows.map(row => this.convertToMemory({
      id: row.id,
      childId: row.child_id,
      content: row.content,
      type: row.type,
      importance: row.importance,
      embedding: row.embedding,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async generateMemoryInsights(childId: number): Promise<MemoryInsight[]> {
    const memories = await this.retrieveMemories({
      query: '',
      childId,
      limit: 100
    });

    // Group memories by type and analyze patterns
    const insights: MemoryInsight[] = [];
    
    const memoryTypes = ['conversational', 'learning', 'emotional', 'behavioral'] as MemoryType[];
    
    for (const type of memoryTypes) {
      const typeMemories = memories.filter(m => m.type === type);
      if (typeMemories.length > 2) {
        const concepts = typeMemories.flatMap(m => m.metadata?.concepts || []);
        const topConcepts = this.getTopConcepts(concepts);
        
        if (topConcepts.length > 0) {
          insights.push({
            pattern: `${type}_trends`,
            description: `Strong interest in ${topConcepts.join(', ')} based on ${type} memories`,
            confidence: Math.min(typeMemories.length / 10, 1),
            recommendations: [`Encourage more activities related to ${topConcepts[0]}`],
            supporting_memories: typeMemories.slice(0, 3).map(m => m.id)
          });
        }
      }
    }

    return insights;
  }

  async getMemoryTimeline(childId: number, timeframe: string): Promise<Memory[]> {
    return this.retrieveMemories({
      query: '',
      childId,
      timeframe: timeframe as any,
      limit: 50
    });
  }

  async bulkCreateMemories(memories: Omit<Memory, 'id' | 'createdAt'>[]): Promise<Memory[]> {
    const results: Memory[] = [];
    
    for (const memory of memories) {
      const created = await this.createMemory(
        memory.childId,
        memory.content,
        memory.type,
        memory.metadata
      );
      results.push(created);
    }
    
    return results;
  }

  async archiveOldMemories(childId: number, cutoffDate: Date): Promise<number> {
    const result = await db
      .delete(memories)
      .where(and(
        eq(memories.childId, childId),
        sql`${memories.createdAt} < ${cutoffDate.toISOString()}`
      ));

    return result.rowCount || 0;
  }

  async consolidateMemories(childId: number): Promise<ConsolidationResult> {
    const startTime = Date.now();
    
    // Refresh importance scores
    await this.refreshMemoryImportance(childId);
    
    // Get all memories for consolidation
    const allMemories = await this.retrieveMemories({
      query: '',
      childId,
      limit: 1000
    });

    // Merge similar memories
    const mergeResults = await this.mergeRelatedMemories(childId, 0.85);
    
    // Archive very old, low-importance memories
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const archived = await this.archiveOldMemories(childId, thirtyDaysAgo);

    const processingTime = Date.now() - startTime;

    console.log(`Memory consolidation completed: ${allMemories.length} processed, ${mergeResults.length} merged, ${archived} archived`);

    return {
      consolidatedMemories: allMemories.length,
      mergedMemories: mergeResults.length,
      archivedMemories: archived,
      newInsights: await this.generateMemoryInsights(childId),
      processingTime
    };
  }

  async calculateImportanceScore(memory: Memory, context: ChildMemoryContext): Promise<number> {
    let score = 0.5; // Base score

    // Recent memories are more important
    const daysSinceCreation = (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0, 1 - daysSinceCreation / 30); // Decays over 30 days
    score += recencyBonus * 0.2;

    // Learning memories are highly important
    if (memory.type === 'learning') {
      score += 0.3;
    }

    // Emotional memories with strong emotions are important
    if (memory.type === 'emotional' && memory.metadata?.emotionalTone) {
      score += 0.2;
    }

    // Memories related to active interests are more important
    const concepts = memory.metadata?.concepts || [];
    const interestMatch = concepts.some(concept => 
      context.activeInterests.some(interest => 
        interest.toLowerCase().includes(concept.toLowerCase())
      )
    );
    if (interestMatch) {
      score += 0.2;
    }

    // Relationship building memories are important
    if (memory.type === 'relationship') {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  async refreshMemoryImportance(childId: number): Promise<void> {
    const context = await this.getChildContext(childId);
    const memories = await this.retrieveMemories({
      query: '',
      childId,
      limit: 1000
    });

    let updated = 0;
    for (const memory of memories) {
      const newImportance = await this.calculateImportanceScore(memory, context);
      if (Math.abs(newImportance - memory.importance) > 0.05) {
        await this.updateMemoryImportance(memory.id, newImportance);
        updated++;
      }
    }

    console.log(`Updated importance scores for ${updated} memories`);
  }

  async getMemoryStats(childId: number): Promise<MemoryStatistics> {
    const allMemories = await this.retrieveMemories({
      query: '',
      childId,
      limit: 1000
    });

    const memoriesByType = allMemories.reduce((acc, memory) => {
      acc[memory.type] = (acc[memory.type] || 0) + 1;
      return acc;
    }, {} as Record<MemoryType, number>);

    const totalImportance = allMemories.reduce((sum, memory) => sum + memory.importance, 0);
    const averageImportance = allMemories.length > 0 ? totalImportance / allMemories.length : 0;

    return {
      totalMemories: allMemories.length,
      memoriesByType,
      averageImportance,
      memoryTrends: [],
      storageEfficiency: 1.0, // PostgreSQL handles this automatically
      lastConsolidation: null
    };
  }

  async mergeRelatedMemories(childId: number, threshold: number = 0.8): Promise<MergeResult[]> {
    // This is a simplified version - in practice, you'd implement more sophisticated merging
    return [];
  }

  // Helper methods (simplified versions of the local memory service methods)
  private async calculateInitialImportance(content: string, type: MemoryType, metadata: MemoryMetadata): Promise<number> {
    let importance = 0.5;
    
    if (type === 'learning') importance += 0.3;
    if (type === 'emotional') importance += 0.2;
    if (metadata.emotionalTone === 'happy' || metadata.emotionalTone === 'excited') importance += 0.1;
    if (metadata.concepts && metadata.concepts.length > 2) importance += 0.1;
    
    return Math.min(importance, 1.0);
  }

  private async generatePersonalityProfile(childId: number, memories: Memory[]): Promise<PersonalityProfile> {
    // Simplified personality generation
    return {
      confidence: 0.7,
      curiosity: 0.8,
      social: 0.6,
      creativity: 0.7,
      attention_span: 0.6,
      preferred_topics: ['learning', 'games', 'stories'],
      communication_style: 'enthusiastic'
    };
  }

  private async generateLearningStyle(childId: number, memories: Memory[]): Promise<LearningStyle> {
    return {
      visual: 0.7,
      auditory: 0.8,
      kinesthetic: 0.6,
      pace: 'medium',
      difficulty_preference: 'moderate',
      feedback_type: 'encouraging'
    };
  }

  private async extractActiveInterests(childId: number, memories: Memory[]): Promise<string[]> {
    const concepts = memories.flatMap(m => m.metadata?.concepts || []);
    return this.getTopConcepts(concepts);
  }

  private async calculateRelationshipLevel(childId: number, memories: Memory[]): Promise<number> {
    const relationshipMemories = memories.filter(m => m.type === 'relationship');
    return Math.min(relationshipMemories.length / 10, 1.0);
  }

  private async detectEmotionalState(childId: number, memories: Memory[]): Promise<string> {
    const recentEmotions = memories
      .filter(m => m.type === 'emotional' && m.metadata?.emotionalTone)
      .slice(0, 5)
      .map(m => m.metadata?.emotionalTone);
    
    if (recentEmotions.includes('happy')) return 'happy';
    if (recentEmotions.includes('excited')) return 'excited';
    return 'neutral';
  }

  private getTopConcepts(concepts: string[]): string[] {
    const conceptCounts = concepts.reduce((acc, concept) => {
      acc[concept] = (acc[concept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(conceptCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([concept]) => concept);
  }
}

// Export the vector memory service
export const vectorMemoryService = new PostgreSQLVectorMemoryService();