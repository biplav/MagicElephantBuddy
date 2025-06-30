// Official Mem0 Service Integration
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

// Import mem0ai from nested dependency
const mem0aiPath = path.join(process.cwd(), 'node_modules/@mastra/mem0/node_modules/mem0ai');
const { MemoryClient } = require(mem0aiPath);

export interface Mem0Config {
  apiKey?: string;
  userId?: string;
  baseUrl?: string;
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

export class Mem0Service {
  private client: any;
  private isConfigured: boolean = false;

  constructor(config?: Mem0Config) {
    if (config?.apiKey) {
      try {
        this.client = new MemoryClient({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl
        });
        this.isConfigured = true;
        console.log('✅ Mem0 service configured with API key');
      } catch (error: any) {
        console.error('❌ Failed to configure Mem0 client:', error.message);
        this.isConfigured = false;
      }
    } else {
      console.log('⚠️ Mem0 service created without API key - will use fallback mode');
      this.isConfigured = false;
    }
  }

  async addMemory(content: string, userId: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    if (!this.isConfigured) {
      console.log('⚠️ Mem0 not configured - memory not added to Mem0 service');
      return null;
    }

    try {
      const result = await this.client.add(content, {
        user_id: userId,
        metadata: metadata || {}
      });
      
      console.log('✅ Memory added to Mem0:', result);
      return result;
    } catch (error: any) {
      console.error('❌ Failed to add memory to Mem0:', error.message);
      return null;
    }
  }

  async searchMemories(query: string, userId: string, limit: number = 10): Promise<Mem0SearchResult[]> {
    if (!this.isConfigured) {
      console.log('⚠️ Mem0 not configured - returning empty search results');
      return [];
    }

    try {
      const results = await this.client.search(query, {
        user_id: userId,
        limit
      });
      
      console.log(`✅ Found ${results.length} memories in Mem0 for query: "${query}"`);
      return results;
    } catch (error: any) {
      console.error('❌ Failed to search Mem0 memories:', error.message);
      return [];
    }
  }

  async getAllMemories(userId: string): Promise<Mem0Memory[]> {
    if (!this.isConfigured) {
      console.log('⚠️ Mem0 not configured - returning empty memory list');
      return [];
    }

    try {
      const memories = await this.client.getAll({
        user_id: userId
      });
      
      console.log(`✅ Retrieved ${memories.length} memories from Mem0 for user ${userId}`);
      return memories;
    } catch (error: any) {
      console.error('❌ Failed to get all memories from Mem0:', error.message);
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    if (!this.isConfigured) {
      console.log('⚠️ Mem0 not configured - memory not deleted');
      return false;
    }

    try {
      await this.client.delete(memoryId);
      console.log(`✅ Memory ${memoryId} deleted from Mem0`);
      return true;
    } catch (error: any) {
      console.error('❌ Failed to delete memory from Mem0:', error.message);
      return false;
    }
  }

  async updateMemory(memoryId: string, content: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    if (!this.isConfigured) {
      console.log('⚠️ Mem0 not configured - memory not updated');
      return null;
    }

    try {
      const result = await this.client.update(memoryId, content, {
        metadata: metadata || {}
      });
      
      console.log('✅ Memory updated in Mem0:', result);
      return result;
    } catch (error: any) {
      console.error('❌ Failed to update memory in Mem0:', error.message);
      return null;
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }

  // Console URL for viewing memories
  getConsoleUrl(): string {
    return 'https://app.mem0.ai/';
  }
}

// Create service instance - will be configured when API key is provided
export const mem0Service = new Mem0Service({
  apiKey: process.env.MEM0_API_KEY,
  baseUrl: process.env.MEM0_BASE_URL
});

// Export for configuration
export { MemoryClient };