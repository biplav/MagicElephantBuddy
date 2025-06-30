import { OpenSourceMem0Service } from './mem0-service';
import { Mem0ManagedService } from './mem0-managed-service';
import type { Mem0Memory, Mem0SearchResult } from './mem0-service';

export type Mem0ServiceMode = 'open-source' | 'managed' | 'hybrid';

export interface HybridConfig {
  mode: Mem0ServiceMode;
  preferManaged?: boolean; // When in hybrid mode, prefer managed service
  fallbackEnabled?: boolean; // Fall back to other service if primary fails
}

export class Mem0HybridService {
  private openSourceService: OpenSourceMem0Service;
  private managedService: Mem0ManagedService;
  private config: HybridConfig;

  constructor(config: HybridConfig = { mode: 'open-source' }) {
    this.config = {
      preferManaged: true,
      fallbackEnabled: true,
      ...config
    };

    // Initialize both services
    this.openSourceService = new OpenSourceMem0Service({
      vectorStore: 'cockroachdb',
      llmProvider: 'openai',
      embeddingProvider: 'openai'
    });

    this.managedService = new Mem0ManagedService({
      apiKey: process.env.MEM0_API_KEY || ''
    });

    console.log(`🔄 Mem0 Hybrid Service initialized in '${this.config.mode}' mode`);
    console.log(`   Open Source: ${this.openSourceService.isReady() ? '✅' : '❌'}`);
    console.log(`   Managed: ${this.managedService.isReady() ? '✅' : '❌'}`);
  }

  private getPrimaryService() {
    switch (this.config.mode) {
      case 'open-source':
        return this.openSourceService;
      case 'managed':
        return this.managedService;
      case 'hybrid':
        return this.config.preferManaged && this.managedService.isReady() 
          ? this.managedService 
          : this.openSourceService;
    }
  }

  private getFallbackService() {
    if (!this.config.fallbackEnabled) return null;
    
    const primary = this.getPrimaryService();
    return primary === this.openSourceService ? this.managedService : this.openSourceService;
  }

  async addMemory(content: string, userId: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    const primary = this.getPrimaryService();
    const fallback = this.getFallbackService();

    try {
      const result = await primary.addMemory(content, userId, metadata);
      if (result) {
        console.log(`✅ Memory added via ${primary === this.managedService ? 'managed' : 'open-source'} service`);
        
        // In hybrid mode, also save to secondary service
        if (this.config.mode === 'hybrid' && fallback?.isReady()) {
          try {
            await fallback.addMemory(content, userId, metadata);
            console.log(`✅ Memory synced to ${fallback === this.managedService ? 'managed' : 'open-source'} service`);
          } catch (syncError) {
            console.warn('Failed to sync memory to secondary service:', syncError);
          }
        }
        
        return result;
      }
    } catch (error) {
      console.warn(`Primary service failed, trying fallback:`, error);
    }

    // Try fallback service
    if (fallback?.isReady()) {
      try {
        const result = await fallback.addMemory(content, userId, metadata);
        if (result) {
          console.log(`✅ Memory added via fallback ${fallback === this.managedService ? 'managed' : 'open-source'} service`);
          return result;
        }
      } catch (fallbackError) {
        console.error('Fallback service also failed:', fallbackError);
      }
    }

    return null;
  }

  async searchMemories(query: string, userId: string, limit: number = 10): Promise<Mem0SearchResult[]> {
    const primary = this.getPrimaryService();
    const fallback = this.getFallbackService();

    try {
      const results = await primary.searchMemories(query, userId, limit);
      console.log(`🔍 Found ${results.length} memories via ${primary === this.managedService ? 'managed' : 'open-source'} service`);
      return results;
    } catch (error) {
      console.warn(`Primary search failed, trying fallback:`, error);
    }

    // Try fallback service
    if (fallback?.isReady()) {
      try {
        const results = await fallback.searchMemories(query, userId, limit);
        console.log(`🔍 Found ${results.length} memories via fallback ${fallback === this.managedService ? 'managed' : 'open-source'} service`);
        return results;
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
      }
    }

    return [];
  }

  async getAllMemories(userId: string): Promise<Mem0Memory[]> {
    const primary = this.getPrimaryService();
    
    if (this.config.mode === 'hybrid') {
      // In hybrid mode, combine memories from both services
      const results: Mem0Memory[] = [];
      const seen = new Set<string>();

      try {
        const openSourceMemories = await this.openSourceService.getAllMemories(userId);
        openSourceMemories.forEach(memory => {
          if (!seen.has(memory.hash)) {
            results.push(memory);
            seen.add(memory.hash);
          }
        });
      } catch (error) {
        console.warn('Failed to get memories from open source service:', error);
      }

      if (this.managedService.isReady()) {
        try {
          const managedMemories = await this.managedService.getAllMemories(userId);
          managedMemories.forEach(memory => {
            if (!seen.has(memory.hash)) {
              results.push(memory);
              seen.add(memory.hash);
            }
          });
        } catch (error) {
          console.warn('Failed to get memories from managed service:', error);
        }
      }

      console.log(`📚 Retrieved ${results.length} unique memories from hybrid services`);
      return results;
    }

    // Single service mode
    try {
      return await primary.getAllMemories(userId);
    } catch (error) {
      console.warn('Primary service failed, trying fallback:', error);
      const fallback = this.getFallbackService();
      if (fallback?.isReady()) {
        return await fallback.getAllMemories(userId);
      }
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    let success = false;

    // Try to delete from all available services in hybrid mode
    if (this.config.mode === 'hybrid') {
      try {
        if (this.openSourceService.isReady()) {
          await this.openSourceService.deleteMemory(memoryId);
          success = true;
        }
      } catch (error) {
        console.warn('Failed to delete from open source service:', error);
      }

      try {
        if (this.managedService.isReady()) {
          await this.managedService.deleteMemory(memoryId);
          success = true;
        }
      } catch (error) {
        console.warn('Failed to delete from managed service:', error);
      }

      return success;
    }

    // Single service mode
    const primary = this.getPrimaryService();
    try {
      return await primary.deleteMemory(memoryId);
    } catch (error) {
      console.warn('Primary service failed, trying fallback:', error);
      const fallback = this.getFallbackService();
      if (fallback?.isReady()) {
        return await fallback.deleteMemory(memoryId);
      }
      return false;
    }
  }

  async updateMemory(memoryId: string, content: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    const primary = this.getPrimaryService();
    const fallback = this.getFallbackService();

    try {
      const result = await primary.updateMemory(memoryId, content, metadata);
      if (result && this.config.mode === 'hybrid' && fallback?.isReady()) {
        // Sync update to secondary service
        try {
          await fallback.updateMemory(memoryId, content, metadata);
        } catch (syncError) {
          console.warn('Failed to sync memory update to secondary service:', syncError);
        }
      }
      return result;
    } catch (error) {
      console.warn('Primary service failed, trying fallback:', error);
      if (fallback?.isReady()) {
        return await fallback.updateMemory(memoryId, content, metadata);
      }
      return null;
    }
  }

  isReady(): boolean {
    const primary = this.getPrimaryService();
    const fallback = this.getFallbackService();
    
    return primary.isReady() || (fallback?.isReady() ?? false);
  }

  getConsoleUrl(): string {
    const primary = this.getPrimaryService();
    return primary.getConsoleUrl();
  }

  getStorageInfo(): string {
    const openSourceReady = this.openSourceService.isReady();
    const managedReady = this.managedService.isReady();
    
    switch (this.config.mode) {
      case 'open-source':
        return 'CockroachDB Vector Storage (Open Source)';
      case 'managed':
        return 'Mem0 Cloud (Managed Service)';
      case 'hybrid':
        if (openSourceReady && managedReady) {
          return 'Hybrid: CockroachDB + Mem0 Cloud';
        } else if (openSourceReady) {
          return 'CockroachDB Vector Storage (Fallback)';
        } else if (managedReady) {
          return 'Mem0 Cloud (Fallback)';
        } else {
          return 'No services available';
        }
    }
  }

  getServiceStatus(): { openSource: boolean; managed: boolean; mode: string } {
    return {
      openSource: this.openSourceService.isReady(),
      managed: this.managedService.isReady(),
      mode: this.config.mode
    };
  }

  // Switch between modes at runtime
  switchMode(mode: Mem0ServiceMode) {
    this.config.mode = mode;
    console.log(`🔄 Switched to '${mode}' mode`);
  }
}

// Create hybrid service instance
export const mem0HybridService = new Mem0HybridService({
  mode: process.env.MEM0_API_KEY ? 'hybrid' : 'open-source',
  preferManaged: true,
  fallbackEnabled: true
});