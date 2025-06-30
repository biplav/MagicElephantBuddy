import { Mem0Memory, Mem0SearchResult } from './mem0-service';

export interface Mem0ManagedConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Mem0ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
}

export class Mem0ManagedService {
  private config: Mem0ManagedConfig;
  private isConfigured: boolean = false;
  
  constructor(config: Mem0ManagedConfig) {
    this.config = {
      baseUrl: 'https://api.mem0.ai/v1',
      ...config
    };
    
    if (config.apiKey) {
      this.isConfigured = true;
      console.log('✅ Mem0 Managed Service configured with API key');
    } else {
      console.log('⚠️ Mem0 Managed Service not configured - no API key provided');
    }
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.isConfigured) {
      throw new Error('Mem0 Managed Service not configured');
    }

    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = {
      'x-api-key': this.config.apiKey,
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mem0 API Error (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error: any) {
      // Better error handling for API key issues
      if (error.message.includes('Invalid API key') || error.message.includes('token_not_valid')) {
        console.warn('❌ Mem0 API key is invalid or expired');
        this.isConfigured = false;
      }
      console.error('Mem0 API request failed:', error);
      throw error;
    }
  }

  async addMemory(content: string, userId: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    try {
      const payload = {
        messages: [{ content, role: 'user' }],
        user_id: userId,
        metadata: metadata || {}
      };

      const response = await this.makeRequest('/memories', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // Handle both direct response and nested data response
      const memoryData = response.data || response;
      
      if (memoryData && memoryData.id) {
        console.log(`✅ Memory added to Mem0 Cloud: ${memoryData.id}`);
        return {
          id: memoryData.id,
          memory: memoryData.memory || content,
          user_id: userId,
          hash: memoryData.hash || this.generateHash(content),
          metadata: memoryData.metadata || metadata || {},
          created_at: memoryData.created_at || new Date().toISOString(),
          updated_at: memoryData.updated_at || new Date().toISOString()
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to add memory to Mem0 managed service:', error);
      return null;
    }
  }

  private generateHash(content: string): string {
    // Simple hash function for consistency
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async searchMemories(query: string, userId: string, limit: number = 10): Promise<Mem0SearchResult[]> {
    try {
      const response = await this.makeRequest(`/memories/search`, {
        method: 'POST',
        body: JSON.stringify({
          query,
          user_id: userId,
          limit
        })
      });

      if (response.success && response.data) {
        return response.data.map((item: any) => ({
          id: item.id,
          memory: item.memory,
          user_id: userId,
          score: item.score || 0,
          metadata: item.metadata || {}
        }));
      }

      return [];
    } catch (error) {
      console.error('Failed to search memories in Mem0 managed service:', error);
      return [];
    }
  }

  async getAllMemories(userId: string): Promise<Mem0Memory[]> {
    try {
      const response = await this.makeRequest(`/memories?user_id=${userId}`);

      if (response.success && response.data) {
        return response.data.map((item: any) => ({
          id: item.id,
          memory: item.memory,
          user_id: userId,
          hash: item.hash || '',
          metadata: item.metadata || {},
          created_at: item.created_at,
          updated_at: item.updated_at
        }));
      }

      return [];
    } catch (error) {
      console.error('Failed to get all memories from Mem0 managed service:', error);
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/memories/${memoryId}`, {
        method: 'DELETE'
      });

      return response.success || false;
    } catch (error) {
      console.error('Failed to delete memory from Mem0 managed service:', error);
      return false;
    }
  }

  async updateMemory(memoryId: string, content: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    try {
      const response = await this.makeRequest(`/memories/${memoryId}`, {
        method: 'PUT',
        body: JSON.stringify({
          memory: content,
          metadata: metadata || {}
        })
      });

      if (response.success && response.data) {
        return {
          id: response.data.id,
          memory: response.data.memory,
          user_id: response.data.user_id,
          hash: response.data.hash || '',
          metadata: response.data.metadata || {},
          created_at: response.data.created_at,
          updated_at: response.data.updated_at
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to update memory in Mem0 managed service:', error);
      return null;
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }

  getConsoleUrl(): string {
    return 'https://app.mem0.ai/dashboard'; // Official Mem0 console
  }

  getStorageInfo(): string {
    return 'Mem0 Cloud (Managed Service)';
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with a simple search call that should work with any valid API key
      const response = await this.makeRequest('/memories/search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test',
          user_id: 'connection_test',
          limit: 1
        })
      });
      console.log('✅ Mem0 API connection successful');
      return true;
    } catch (error: any) {
      if (error.message.includes('Invalid API key')) {
        console.log('❌ Mem0 API key is invalid or expired');
        console.log('   Please get a valid API key from: https://app.mem0.ai/dashboard/api-keys');
        console.log('   Current key format:', this.config.apiKey.substring(0, 8) + '...');
        this.isConfigured = false;
      } else {
        console.log('⚠️ Mem0 API connection test failed:', error.message);
      }
      return false;
    }
  }
}

// Create managed service instance if API key is available
export const mem0ManagedService = new Mem0ManagedService({
  apiKey: process.env.MEM0_API_KEY || ''
});