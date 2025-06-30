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
    } catch (error) {
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

      if (response.success && response.data) {
        return {
          id: response.data.id,
          memory: response.data.memory || content,
          user_id: userId,
          hash: response.data.hash || '',
          metadata: response.data.metadata || metadata || {},
          created_at: response.data.created_at || new Date().toISOString(),
          updated_at: response.data.updated_at || new Date().toISOString()
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to add memory to Mem0 managed service:', error);
      return null;
    }
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
}

// Create managed service instance if API key is available
export const mem0ManagedService = new Mem0ManagedService({
  apiKey: process.env.MEM0_API_KEY || ''
});