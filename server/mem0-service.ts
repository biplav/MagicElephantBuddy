// Open Source Mem0-Style Service Implementation
// Following the open source Mem0 architecture with local vector storage
import { db } from './db';
import { memories } from '../shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { createAIService } from './ai-service';

export interface Mem0Config {
  vectorStore: 'cockroachdb' | 'local';
  llmProvider: 'openai' | 'gemini';  
  embeddingProvider: 'openai';
  openaiApiKey?: string;
}

export interface Mem0Memory {
  id: string;
  memory: string;
  user_id: string;
  hash: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Mem0SearchResult {
  id: string;
  memory: string;
  user_id: string;
  score: number;
  metadata: Record<string, any>;
}

export class OpenSourceMem0Service {
  private openai: OpenAI | null = null;
  private aiService: any;
  private isConfigured: boolean = false;
  private config: Mem0Config;

  constructor(config: Mem0Config = {
    vectorStore: 'cockroachdb',
    llmProvider: 'openai',
    embeddingProvider: 'openai'
  }) {
    this.config = config;
    
    // Initialize OpenAI for embeddings
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.aiService = createAIService('standard');
      this.isConfigured = true;
      console.log('✅ Open Source Mem0 service configured with local vector storage');
    } else {
      console.log('⚠️ OpenAI API key not found - service will work in limited mode');
      this.isConfigured = false;
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      console.error('OpenAI not configured for embeddings');
      return [];
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 1536
      });
      
      return response.data[0].embedding;
    } catch (error: any) {
      console.error('Error generating embedding:', error.message);
      return [];
    }
  }

  private generateMemoryId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateHash(content: string): string {
    // Simple hash function for memory deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  async addMemory(content: string, userId: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    try {
      const memoryId = this.generateMemoryId();
      const hash = this.generateHash(content);
      const embedding = await this.generateEmbedding(content);
      
      if (embedding.length === 0) {
        console.log('⚠️ Could not generate embedding - storing without vector search capability');
      }

      // Check for existing memory with same hash to prevent duplicates
      const existingMemory = await db.select()
        .from(memories)
        .where(and(
          eq(memories.childId, parseInt(userId.replace('child_', ''))),
          sql`metadata->>'hash' = ${hash}`
        ))
        .limit(1);

      if (existingMemory.length > 0) {
        console.log('⚠️ Similar memory already exists, updating instead');
        return this.convertToMem0Memory(existingMemory[0]);
      }

      // Insert new memory
      const [newMemory] = await db.insert(memories).values({
        id: memoryId,
        childId: parseInt(userId.replace('child_', '')),
        content,
        type: 'conversational',
        importance: 0.5,
        embedding: embedding.length > 0 ? embedding : null,
        metadata: {
          ...metadata,
          hash,
          source: 'mem0_open_source'
        }
      }).returning();

      console.log('✅ Memory added to open source Mem0:', memoryId);
      return this.convertToMem0Memory(newMemory);
    } catch (error: any) {
      console.error('❌ Failed to add memory to open source Mem0:', error.message);
      return null;
    }
  }

  async searchMemories(query: string, userId: string, limit: number = 10): Promise<Mem0SearchResult[]> {
    try {
      const embedding = await this.generateEmbedding(query);
      const childId = parseInt(userId.replace('child_', ''));
      
      if (embedding.length === 0) {
        // Fallback to text search if embedding fails
        const results = await db.select()
          .from(memories)
          .where(and(
            eq(memories.childId, childId),
            sql`LOWER(content) LIKE ${`%${query.toLowerCase()}%`}`
          ))
          .orderBy(desc(memories.importance), desc(memories.createdAt))
          .limit(limit);
          
        return results.map(r => this.convertToMem0SearchResult(r, 0.5));
      }

      // Vector similarity search using CockroachDB native operations
      const results = await db.execute(sql`
        SELECT *, 
               1 - (embedding <=> ${JSON.stringify(embedding)}::VECTOR(1536)) as similarity
        FROM ${memories}
        WHERE child_id = ${childId}
          AND embedding IS NOT NULL
          AND 1 - (embedding <=> ${JSON.stringify(embedding)}::VECTOR(1536)) > 0.3
        ORDER BY similarity DESC, importance DESC
        LIMIT ${limit}
      `);

      const searchResults = results.rows.map((row: any) => 
        this.convertToMem0SearchResult({
          id: row.id,
          childId: row.child_id,
          content: row.content,
          type: row.type,
          importance: row.importance,
          embedding: row.embedding,
          metadata: row.metadata,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at)
        }, row.similarity)
      );

      console.log(`✅ Found ${searchResults.length} memories using vector search for: "${query}"`);
      return searchResults;
    } catch (error: any) {
      console.error('❌ Failed to search memories:', error.message);
      return [];
    }
  }

  async getAllMemories(userId: string): Promise<Mem0Memory[]> {
    try {
      const childId = parseInt(userId.replace('child_', ''));
      const results = await db.select()
        .from(memories)
        .where(eq(memories.childId, childId))
        .orderBy(desc(memories.createdAt));
      
      const mem0Memories = results.map(r => this.convertToMem0Memory(r));
      console.log(`✅ Retrieved ${mem0Memories.length} memories for user ${userId}`);
      return mem0Memories;
    } catch (error: any) {
      console.error('❌ Failed to get all memories:', error.message);
      return [];
    }
  }

  private convertToMem0Memory(dbMemory: any): Mem0Memory {
    return {
      id: dbMemory.id,
      memory: dbMemory.content,
      user_id: `child_${dbMemory.childId}`,
      hash: dbMemory.metadata?.hash || this.generateHash(dbMemory.content),
      metadata: dbMemory.metadata || {},
      created_at: dbMemory.createdAt.toISOString(),
      updated_at: dbMemory.updatedAt.toISOString()
    };
  }

  private convertToMem0SearchResult(dbMemory: any, score: number): Mem0SearchResult {
    return {
      id: dbMemory.id,
      memory: dbMemory.content,
      user_id: `child_${dbMemory.childId}`,
      score,
      metadata: dbMemory.metadata || {}
    };
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    try {
      await db.delete(memories).where(eq(memories.id, memoryId));
      console.log(`✅ Memory ${memoryId} deleted from open source Mem0`);
      return true;
    } catch (error: any) {
      console.error('❌ Failed to delete memory:', error.message);
      return false;
    }
  }

  async updateMemory(memoryId: string, content: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    try {
      const embedding = await this.generateEmbedding(content);
      const hash = this.generateHash(content);
      
      const [updatedMemory] = await db.update(memories)
        .set({
          content,
          embedding: embedding.length > 0 ? embedding : null,
          metadata: {
            ...metadata,
            hash,
            source: 'mem0_open_source',
            updated: true
          },
          updatedAt: new Date()
        })
        .where(eq(memories.id, memoryId))
        .returning();

      if (!updatedMemory) {
        console.log(`⚠️ Memory ${memoryId} not found`);
        return null;
      }
      
      console.log('✅ Memory updated in open source Mem0:', memoryId);
      return this.convertToMem0Memory(updatedMemory);
    } catch (error: any) {
      console.error('❌ Failed to update memory:', error.message);
      return null;
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }

  // Local console access - since this is open source and self-hosted
  getConsoleUrl(): string {
    return 'http://localhost:5000/memories'; // Points to our local interface
  }

  getStorageInfo(): string {
    return `Open Source Mem0 using ${this.config.vectorStore} with ${this.config.embeddingProvider} embeddings`;
  }
}

// Create service instance with open source configuration
export const openSourceMem0Service = new OpenSourceMem0Service({
  vectorStore: 'cockroachdb',
  llmProvider: 'openai',
  embeddingProvider: 'openai'
});

// Legacy export for compatibility
export const mem0Service = openSourceMem0Service;