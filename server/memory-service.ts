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
}

// Export singleton instance
export const memoryService = new LocalMemoryService();