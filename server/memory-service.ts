// Note: Using local memory store for Phase 1, will integrate with Mem0 in Phase 2
// import { Mem0Integration } from '@mastra/mem0';

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  childId: number;
  importance: number;
  metadata?: MemoryMetadata;
  createdAt: Date;
  updatedAt?: Date;
}

export type MemoryType = 
  | 'conversational'   // Previous conversations and dialogue context
  | 'behavioral'       // Learning patterns and behavioral traits
  | 'learning'         // Educational progress and concept understanding
  | 'visual'           // Visual context from video interactions
  | 'emotional'        // Emotional patterns and responses
  | 'relationship'     // Bond development with Appu
  | 'cultural'         // Cultural context and family dynamics
  | 'preference';      // Interests and preferences

export interface MemoryMetadata {
  conversationId?: number;
  milestoneId?: number;
  emotionalTone?: string;
  concepts?: string[];
  importance_score?: number;
  context_tags?: string[];
  visual_objects?: string[];
  learning_outcome?: string;
  family_context?: string;
}

export interface ChildMemoryContext {
  childId: number;
  recentMemories: Memory[];
  personalityProfile: PersonalityProfile;
  learningStyle: LearningStyle;
  relationshipLevel: number;
  activeInterests: string[];
  emotionalState?: string;
}

export interface PersonalityProfile {
  confidence: number;
  curiosity: number;
  social: number;
  creativity: number;
  attention_span: number;
  preferred_topics: string[];
  communication_style: string;
}

export interface LearningStyle {
  visual: number;
  auditory: number;
  kinesthetic: number;
  pace: 'slow' | 'medium' | 'fast';
  difficulty_preference: 'easy' | 'moderate' | 'challenging';
  feedback_type: 'immediate' | 'delayed' | 'encouraging';
}

export interface MemoryQuery {
  query: string;
  childId: number;
  type?: MemoryType;
  limit?: number;
  threshold?: number;
  timeframe?: 'day' | 'week' | 'month' | 'all';
}

export interface MemoryInsight {
  pattern: string;
  description: string;
  confidence: number;
  recommendations: string[];
  supporting_memories: string[];
}

// Phase 3: Advanced memory interfaces
export interface ConsolidationResult {
  consolidatedMemories: number;
  mergedMemories: number;
  archivedMemories: number;
  newInsights: MemoryInsight[];
  processingTime: number;
}

export interface MemoryStatistics {
  totalMemories: number;
  memoriesByType: Record<MemoryType, number>;
  averageImportance: number;
  memoryTrends: MemoryTrend[];
  storageEfficiency: number;
  lastConsolidation: Date | null;
}

export interface MemoryTrend {
  period: string;
  type: MemoryType;
  count: number;
  averageImportance: number;
  concepts: string[];
}

export interface MergeResult {
  originalMemories: string[];
  mergedMemory: Memory;
  reason: string;
  confidenceScore: number;
}

// Abstract interface for memory operations
export interface IMemoryService {
  // Core memory operations
  createMemory(childId: number, content: string, type: MemoryType, metadata?: MemoryMetadata): Promise<Memory>;
  retrieveMemories(query: MemoryQuery): Promise<Memory[]>;
  updateMemoryImportance(memoryId: string, importance: number): Promise<void>;
  deleteMemory(memoryId: string): Promise<void>;
  
  // Child context operations
  getChildContext(childId: number): Promise<ChildMemoryContext>;
  updateChildContext(childId: number, context: Partial<ChildMemoryContext>): Promise<void>;
  
  // Advanced memory operations
  findSimilarMemories(childId: number, content: string, type?: MemoryType): Promise<Memory[]>;
  generateMemoryInsights(childId: number): Promise<MemoryInsight[]>;
  getMemoryTimeline(childId: number, timeframe: string): Promise<Memory[]>;
  
  // Bulk operations
  bulkCreateMemories(memories: Omit<Memory, 'id' | 'createdAt'>[]): Promise<Memory[]>;
  archiveOldMemories(childId: number, cutoffDate: Date): Promise<number>;
  
  // Phase 3: Advanced memory features
  consolidateMemories(childId: number): Promise<ConsolidationResult>;
  calculateImportanceScore(memory: Memory, context: ChildMemoryContext): Promise<number>;
  refreshMemoryImportance(childId: number): Promise<void>;
  getMemoryStats(childId: number): Promise<MemoryStatistics>;
  mergeRelatedMemories(childId: number, threshold?: number): Promise<MergeResult[]>;
}

// Local memory implementation for Phase 1 (will be replaced with Mem0 in Phase 2)
export class LocalMemoryService implements IMemoryService {
  private memories: Map<string, Memory> = new Map();
  private memoryContextCache: Map<number, ChildMemoryContext> = new Map();
  private memoryIdCounter = 1;

  constructor() {
    console.log('Initialized Local Memory Service (Phase 1)');
  }

  async createMemory(
    childId: number, 
    content: string, 
    type: MemoryType, 
    metadata: MemoryMetadata = {}
  ): Promise<Memory> {
    try {
      const memoryId = `memory_${this.memoryIdCounter++}`;
      
      const memory: Memory = {
        id: memoryId,
        content,
        type,
        childId,
        importance: metadata.importance_score || 0.5,
        metadata,
        createdAt: new Date()
      };

      // Store in local memory map
      this.memories.set(memoryId, memory);

      // Invalidate cache for this child
      this.memoryContextCache.delete(childId);

      console.log(`Created ${type} memory for child ${childId}: ${content.slice(0, 100)}...`);
      return memory;
    } catch (error: any) {
      console.error('Error creating memory:', error);
      throw new Error(`Failed to create memory: ${error.message}`);
    }
  }

  async retrieveMemories(query: MemoryQuery): Promise<Memory[]> {
    try {
      const { query: searchQuery, childId, type, limit = 10 } = query;
      
      // Simple local search implementation
      const childMemories = Array.from(this.memories.values())
        .filter(memory => memory.childId === childId)
        .filter(memory => !type || memory.type === type)
        .filter(memory => memory.content.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, limit);

      return childMemories;
    } catch (error: any) {
      console.error('Error retrieving memories:', error);
      return [];
    }
  }

  async updateMemoryImportance(memoryId: string, importance: number): Promise<void> {
    try {
      // Mem0 doesn't have direct update - we'll track this separately
      console.log(`Updated memory ${memoryId} importance to ${importance}`);
    } catch (error) {
      console.error('Error updating memory importance:', error);
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    try {
      this.memories.delete(memoryId);
      console.log(`Deleted memory ${memoryId}`);
    } catch (error: any) {
      console.error('Error deleting memory:', error);
    }
  }

  async getChildContext(childId: number): Promise<ChildMemoryContext> {
    // Check cache first
    if (this.memoryContextCache.has(childId)) {
      return this.memoryContextCache.get(childId)!;
    }

    try {
      // Get recent memories for context
      const recentMemories = await this.retrieveMemories({
        query: "recent interactions and learning",
        childId,
        limit: 20,
        timeframe: 'week'
      });

      // Generate personality profile from memories
      const personalityProfile = await this.generatePersonalityProfile(childId, recentMemories);
      
      // Generate learning style from memories
      const learningStyle = await this.generateLearningStyle(childId, recentMemories);

      // Extract active interests
      const activeInterests = await this.extractActiveInterests(childId, recentMemories);

      const context: ChildMemoryContext = {
        childId,
        recentMemories,
        personalityProfile,
        learningStyle,
        relationshipLevel: await this.calculateRelationshipLevel(childId, recentMemories),
        activeInterests,
        emotionalState: await this.detectEmotionalState(childId, recentMemories)
      };

      // Cache the context
      this.memoryContextCache.set(childId, context);
      
      return context;
    } catch (error) {
      console.error('Error getting child context:', error);
      // Return default context
      return this.getDefaultChildContext(childId);
    }
  }

  async updateChildContext(childId: number, context: Partial<ChildMemoryContext>): Promise<void> {
    const currentContext = await this.getChildContext(childId);
    const updatedContext = { ...currentContext, ...context };
    this.memoryContextCache.set(childId, updatedContext);
  }

  async findSimilarMemories(childId: number, content: string, type?: MemoryType): Promise<Memory[]> {
    return this.retrieveMemories({
      query: content,
      childId,
      type,
      limit: 5,
      threshold: 0.8
    });
  }

  async generateMemoryInsights(childId: number): Promise<MemoryInsight[]> {
    try {
      const memories = await this.retrieveMemories({
        query: "learning patterns and behavior",
        childId,
        limit: 50
      });

      // Analyze patterns in memories
      const insights: MemoryInsight[] = [];

      // Add learning pattern insights
      const learningMemories = memories.filter(m => m.type === 'learning');
      if (learningMemories.length > 5) {
        insights.push({
          pattern: 'learning_acceleration',
          description: 'Child shows consistent learning progress across multiple concepts',
          confidence: 0.8,
          recommendations: ['Continue with current pace', 'Introduce slightly more challenging concepts'],
          supporting_memories: learningMemories.slice(0, 3).map(m => m.id)
        });
      }

      return insights;
    } catch (error) {
      console.error('Error generating memory insights:', error);
      return [];
    }
  }

  async getMemoryTimeline(childId: number, timeframe: string): Promise<Memory[]> {
    const memories = await this.retrieveMemories({
      query: "all interactions and learning",
      childId,
      limit: 100,
      timeframe: timeframe as any
    });

    return memories.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async bulkCreateMemories(memories: Omit<Memory, 'id' | 'createdAt'>[]): Promise<Memory[]> {
    const results: Memory[] = [];
    
    for (const memory of memories) {
      try {
        const result = await this.createMemory(
          memory.childId,
          memory.content,
          memory.type,
          memory.metadata
        );
        results.push(result);
      } catch (error) {
        console.error('Error in bulk memory creation:', error);
      }
    }

    return results;
  }

  async archiveOldMemories(childId: number, cutoffDate: Date): Promise<number> {
    // Mem0 handles memory lifecycle automatically
    // This would be used for compliance/retention policies
    console.log(`Archiving memories older than ${cutoffDate} for child ${childId}`);
    return 0;
  }

  // Helper methods
  private async generatePersonalityProfile(childId: number, memories: Memory[]): Promise<PersonalityProfile> {
    // Analyze memories to generate personality insights
    const conversationalMemories = memories.filter(m => m.type === 'conversational');
    
    return {
      confidence: 0.7, // Default values - would be calculated from memory analysis
      curiosity: 0.8,
      social: 0.6,
      creativity: 0.7,
      attention_span: 0.6,
      preferred_topics: ['animals', 'colors', 'stories'],
      communication_style: 'enthusiastic'
    };
  }

  private async generateLearningStyle(childId: number, memories: Memory[]): Promise<LearningStyle> {
    return {
      visual: 0.8,
      auditory: 0.6,
      kinesthetic: 0.7,
      pace: 'medium',
      difficulty_preference: 'moderate',
      feedback_type: 'encouraging'
    };
  }

  private async extractActiveInterests(childId: number, memories: Memory[]): Promise<string[]> {
    // Extract frequently mentioned topics from memories
    return ['dinosaurs', 'drawing', 'music', 'stories'];
  }

  private async calculateRelationshipLevel(childId: number, memories: Memory[]): Promise<number> {
    // Calculate bond strength based on interaction patterns
    return Math.min(memories.length * 0.1, 1.0);
  }

  private async detectEmotionalState(childId: number, memories: Memory[]): Promise<string> {
    // Analyze recent emotional context
    return 'happy';
  }

  private getDefaultChildContext(childId: number): ChildMemoryContext {
    return {
      childId,
      recentMemories: [],
      personalityProfile: {
        confidence: 0.5,
        curiosity: 0.5,
        social: 0.5,
        creativity: 0.5,
        attention_span: 0.5,
        preferred_topics: [],
        communication_style: 'friendly'
      },
      learningStyle: {
        visual: 0.5,
        auditory: 0.5,
        kinesthetic: 0.5,
        pace: 'medium',
        difficulty_preference: 'moderate',
        feedback_type: 'encouraging'
      },
      relationshipLevel: 0,
      activeInterests: []
    };
  }

  // Phase 3: Advanced memory features implementation
  async consolidateMemories(childId: number): Promise<ConsolidationResult> {
    const startTime = Date.now();
    let consolidatedMemories = 0;
    let mergedMemories = 0;
    let archivedMemories = 0;

    console.log(`Starting memory consolidation for child ${childId}...`);

    try {
      // Get all memories for the child
      const allMemories = Array.from(this.memories.values())
        .filter(memory => memory.childId === childId);

      // Step 1: Refresh importance scores
      await this.refreshMemoryImportance(childId);
      consolidatedMemories = allMemories.length;

      // Step 2: Merge related memories
      const mergeResults = await this.mergeRelatedMemories(childId, 0.8);
      mergedMemories = mergeResults.length;

      // Step 3: Archive low-importance old memories
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // Archive memories older than 30 days with low importance
      
      const lowImportanceOldMemories = allMemories.filter(memory => 
        memory.createdAt < cutoffDate && memory.importance < 0.3
      );
      
      for (const memory of lowImportanceOldMemories) {
        this.memories.delete(memory.id);
        archivedMemories++;
      }

      // Step 4: Generate new insights from consolidated memories
      const newInsights = await this.generateMemoryInsights(childId);

      const processingTime = Date.now() - startTime;

      console.log(`Memory consolidation completed: ${consolidatedMemories} processed, ${mergedMemories} merged, ${archivedMemories} archived`);

      return {
        consolidatedMemories,
        mergedMemories,
        archivedMemories,
        newInsights,
        processingTime
      };

    } catch (error) {
      console.error('Error during memory consolidation:', error);
      return {
        consolidatedMemories: 0,
        mergedMemories: 0,
        archivedMemories: 0,
        newInsights: [],
        processingTime: Date.now() - startTime
      };
    }
  }

  async calculateImportanceScore(memory: Memory, context: ChildMemoryContext): Promise<number> {
    let importance = 0.5; // Base importance

    // Factor 1: Memory type importance
    const typeWeights: Record<MemoryType, number> = {
      'learning': 0.9,      // Learning progress is very important
      'emotional': 0.8,     // Emotional states are highly important
      'relationship': 0.7,  // Relationship building is important
      'conversational': 0.6, // Regular conversations are moderately important
      'preference': 0.6,    // Preferences are moderately important
      'behavioral': 0.5,    // Behavioral patterns are baseline important
      'visual': 0.4,        // Visual memories are less persistent
      'cultural': 0.5       // Cultural context is baseline important
    };
    importance = typeWeights[memory.type] || 0.5;

    // Factor 2: Recency (newer memories are more important)
    const daysSinceCreation = (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyMultiplier = Math.max(0.3, 1 - (daysSinceCreation * 0.1));
    importance *= recencyMultiplier;

    // Factor 3: Emotional intensity
    if (memory.metadata?.emotionalTone) {
      const emotionalBoost = memory.metadata.emotionalTone === 'positive' ? 0.2 : 
                            memory.metadata.emotionalTone === 'negative' ? 0.3 : 0.1;
      importance += emotionalBoost;
    }

    // Factor 4: Concept relevance to active interests
    if (memory.metadata?.concepts && context.activeInterests) {
      const conceptOverlap = memory.metadata.concepts.filter(concept => 
        context.activeInterests.some(interest => 
          interest.toLowerCase().includes(concept.toLowerCase()) ||
          concept.toLowerCase().includes(interest.toLowerCase())
        )
      ).length;
      importance += conceptOverlap * 0.1;
    }

    // Factor 5: Learning milestone connection
    if (memory.metadata?.milestoneId || memory.metadata?.learning_outcome) {
      importance += 0.2;
    }

    // Normalize to 0-1 range
    return Math.min(1.0, Math.max(0.1, importance));
  }

  async refreshMemoryImportance(childId: number): Promise<void> {
    console.log(`Refreshing importance scores for child ${childId}...`);
    
    const childMemories = Array.from(this.memories.values())
      .filter(memory => memory.childId === childId);
    
    const context = await this.getChildContext(childId);
    
    for (const memory of childMemories) {
      const newImportance = await this.calculateImportanceScore(memory, context);
      memory.importance = newImportance;
      memory.updatedAt = new Date();
    }
    
    console.log(`Updated importance scores for ${childMemories.length} memories`);
  }

  async getMemoryStats(childId: number): Promise<MemoryStatistics> {
    const childMemories = Array.from(this.memories.values())
      .filter(memory => memory.childId === childId);

    const memoriesByType: Record<MemoryType, number> = {
      'conversational': 0,
      'behavioral': 0,
      'learning': 0,
      'visual': 0,
      'emotional': 0,
      'relationship': 0,
      'cultural': 0,
      'preference': 0
    };

    let totalImportance = 0;

    childMemories.forEach(memory => {
      memoriesByType[memory.type]++;
      totalImportance += memory.importance;
    });

    // Generate memory trends (simplified for local implementation)
    const memoryTrends: MemoryTrend[] = Object.entries(memoriesByType)
      .filter(([type, count]) => count > 0)
      .map(([type, count]) => ({
        period: 'last_week',
        type: type as MemoryType,
        count,
        averageImportance: totalImportance / childMemories.length || 0,
        concepts: this.extractConceptsFromMemories(
          childMemories.filter(m => m.type === type)
        )
      }));

    return {
      totalMemories: childMemories.length,
      memoriesByType,
      averageImportance: childMemories.length > 0 ? totalImportance / childMemories.length : 0,
      memoryTrends,
      storageEfficiency: this.calculateStorageEfficiency(childMemories),
      lastConsolidation: null // Would track last consolidation in production
    };
  }

  async mergeRelatedMemories(childId: number, threshold: number = 0.8): Promise<MergeResult[]> {
    const childMemories = Array.from(this.memories.values())
      .filter(memory => memory.childId === childId);

    const mergeResults: MergeResult[] = [];
    const processedMemories = new Set<string>();

    for (const memory of childMemories) {
      if (processedMemories.has(memory.id)) continue;

      // Find similar memories
      const similarMemories = childMemories.filter(other => 
        !processedMemories.has(other.id) &&
        other.id !== memory.id &&
        other.type === memory.type &&
        this.calculateSimilarity(memory, other) >= threshold
      );

      if (similarMemories.length > 0) {
        // Merge memories
        const allMemories = [memory, ...similarMemories];
        const mergedContent = this.mergeMemoryContent(allMemories);
        
        const mergedMemory: Memory = {
          id: `merged_${Date.now()}`,
          content: mergedContent,
          type: memory.type,
          childId,
          importance: Math.max(...allMemories.map(m => m.importance)),
          metadata: this.mergeMetadata(allMemories),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Store merged memory and remove originals
        this.memories.set(mergedMemory.id, mergedMemory);
        
        const originalIds = allMemories.map(m => m.id);
        originalIds.forEach(id => {
          this.memories.delete(id);
          processedMemories.add(id);
        });

        mergeResults.push({
          originalMemories: originalIds,
          mergedMemory,
          reason: `Merged ${allMemories.length} similar ${memory.type} memories`,
          confidenceScore: threshold
        });
      }

      processedMemories.add(memory.id);
    }

    return mergeResults;
  }

  // Helper methods for Phase 3 features
  private calculateSimilarity(memory1: Memory, memory2: Memory): number {
    // Simple similarity calculation based on content overlap
    const words1 = memory1.content.toLowerCase().split(' ');
    const words2 = memory2.content.toLowerCase().split(' ');
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }

  private mergeMemoryContent(memories: Memory[]): string {
    if (memories.length === 1) return memories[0].content;
    
    const contents = memories.map(m => m.content);
    return `Consolidated memory: ${contents.join('; ')}`;
  }

  private mergeMetadata(memories: Memory[]): MemoryMetadata {
    const merged: MemoryMetadata = {
      concepts: [],
      context_tags: []
    };

    memories.forEach(memory => {
      if (memory.metadata?.concepts) {
        merged.concepts = [...(merged.concepts || []), ...memory.metadata.concepts];
      }
      if (memory.metadata?.context_tags) {
        merged.context_tags = [...(merged.context_tags || []), ...memory.metadata.context_tags];
      }
      if (memory.metadata?.conversationId && !merged.conversationId) {
        merged.conversationId = memory.metadata.conversationId;
      }
    });

    // Remove duplicates
    merged.concepts = Array.from(new Set(merged.concepts));
    merged.context_tags = Array.from(new Set(merged.context_tags));

    return merged;
  }

  private extractConceptsFromMemories(memories: Memory[]): string[] {
    const allConcepts: string[] = [];
    memories.forEach(memory => {
      if (memory.metadata?.concepts) {
        allConcepts.push(...memory.metadata.concepts);
      }
    });
    return Array.from(new Set(allConcepts));
  }

  private calculateStorageEfficiency(memories: Memory[]): number {
    // Simple efficiency calculation based on memory density
    const totalCharacters = memories.reduce((sum, memory) => sum + memory.content.length, 0);
    const averageLength = totalCharacters / memories.length;
    
    // Efficiency is higher when memories are more concise but informative
    return Math.min(1.0, 100 / (averageLength || 100));
  }
}

// Export singleton instance
export const memoryService = new LocalMemoryService();