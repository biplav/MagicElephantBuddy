import { createServiceLogger } from '@/lib/logger';

interface GlobalServiceInstance {
  id: string;
  instance: any;
  createdAt: number;
  accessCount: number;
}

class GlobalServiceSingleton {
  private static services: Map<string, GlobalServiceInstance> = new Map();
  private static logger = createServiceLogger('global-singleton');

  static getInstance<T>(key: string, factory: () => T): T {
    const existing = this.services.get(key);
    
    if (existing) {
      existing.accessCount++;
      this.logger.debug(`♻️ SINGLETON: Reusing instance '${key}' (accessed ${existing.accessCount} times)`);
      return existing.instance;
    }

    // Create new instance
    const instance = factory();
    const serviceInstance: GlobalServiceInstance = {
      id: `${key}-${Date.now()}`,
      instance,
      createdAt: Date.now(),
      accessCount: 1
    };
    
    this.services.set(key, serviceInstance);
    this.logger.info(`🆕 SINGLETON: Created instance '${key}' (ID: ${serviceInstance.id})`);
    
    return instance;
  }

  static destroyInstance(key: string): boolean {
    const existing = this.services.get(key);
    if (existing) {
      this.services.delete(key);
      this.logger.info(`🗑️ SINGLETON: Destroyed instance '${key}' (ID: ${existing.id})`);
      return true;
    }
    return false;
  }

  static getAllInstances(): Map<string, GlobalServiceInstance> {
    return new Map(this.services);
  }

  static clearAll(): void {
    const count = this.services.size;
    this.services.clear();
    this.logger.info(`🧹 SINGLETON: Cleared ${count} instances`);
  }

  static getStats(): { totalInstances: number; services: string[] } {
    return {
      totalInstances: this.services.size,
      services: Array.from(this.services.keys())
    };
  }
}

export default GlobalServiceSingleton;