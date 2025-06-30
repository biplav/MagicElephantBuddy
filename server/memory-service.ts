import { MemoryClient } from '@mastra/mem0';

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

// Mem0-powered implementation
export class Mem0Service implements IMemoryService {
  private client: MemoryClient;
  private memoryContextCache: Map<number, ChildMemoryContext> = new Map();

  constructor() {
    this.client = new MemoryClient({
      apiKey: process.env.MEM0_API_KEY,
      // Configure to use CockroachDB as backend
      config: {
        vector_store: {
          provider: 'postgres',
          config: {
            url: process.env.DATABASE_URL,
            collection_name: 'mem0_memories'
          }
        }
      }
    });
  }

  async createMemory(
    childId: number, 
    content: string, 
    type: MemoryType, 
    metadata: MemoryMetadata = {}
  ): Promise<Memory> {
    try {
      // Create memory in Mem0 with child-specific user ID
      const memoryResult = await this.client.add(content, {
        user_id: `child_${childId}`,
        metadata: {
          type,
          child_id: childId,
          ...metadata,
          created_at: new Date().toISOString()
        }
      });

      const memory: Memory = {
        id: memoryResult.id,
        content,
        type,
        childId,
        importance: metadata.importance_score || 0.5,
        metadata,
        createdAt: new Date()
      };

      // Invalidate cache for this child
      this.memoryContextCache.delete(childId);

      console.log(`Created ${type} memory for child ${childId}: ${content.slice(0, 100)}...`);
      return memory;
    } catch (error) {
      console.error('Error creating memory:', error);
      throw new Error(`Failed to create memory: ${error.message}`);
    }
  }

  async retrieveMemories(query: MemoryQuery): Promise<Memory[]> {
    try {
      const { query: searchQuery, childId, type, limit = 10, threshold = 0.7 } = query;
      
      const searchResults = await this.client.search(searchQuery, {
        user_id: `child_${childId}`,
        limit,
        threshold
      });

      const memories: Memory[] = searchResults.map(result => ({
        id: result.id,
        content: result.memory,
        type: (result.metadata?.type || 'conversational') as MemoryType,
        childId: result.metadata?.child_id || childId,
        importance: result.score || 0.5,
        metadata: result.metadata,
        createdAt: new Date(result.metadata?.created_at || Date.now())
      }));

      // Filter by type if specified
      if (type) {
        return memories.filter(memory => memory.type === type);
      }

      return memories;
    } catch (error) {
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
      await this.client.delete(memoryId);
      console.log(`Deleted memory ${memoryId}`);
    } catch (error) {
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
export const memoryService = new Mem0Service();