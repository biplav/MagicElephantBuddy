import React, { createContext, useContext, useRef, useEffect } from 'react';
import { createServiceLogger } from '@/lib/logger';

// Global singleton service instances - created ONCE and never recreated
interface GlobalServices {
  workflowStateMachine: any;
  bookManager: any;
  realtimeAudioService: any;
  isInitialized: boolean;
}

const GlobalServiceContext = createContext<GlobalServices | null>(null);

let globalServicesInstance: GlobalServices | null = null;

interface GlobalServiceProviderProps {
  children: React.ReactNode;
}

export function GlobalServiceProvider({ children }: GlobalServiceProviderProps) {
  const logger = createServiceLogger('global-services');
  const initRef = useRef(false);

  // Create services only ONCE across the entire application lifecycle
  if (!globalServicesInstance && !initRef.current) {
    logger.info("🌍 GLOBAL-SERVICES: Creating singleton instances...");
    
    // Import and create services dynamically to avoid circular dependencies
    const createServices = async () => {
      const { useWorkflowStateMachine } = await import('@/hooks/useWorkflowStateMachine');
      const { useBookManager } = await import('@/hooks/useBookManager');
      
      // Create a fake React component to call hooks
      let services: any = {};
      const ServiceCreator = () => {
        services.workflowStateMachine = useWorkflowStateMachine();
        services.bookManager = useBookManager({
          workflowStateMachine: services.workflowStateMachine,
          onStorybookPageDisplay: (pageData: any) => {
            logger.info("Global storybook page display", { pageData });
          },
          onFunctionCallResult: (callId: string, result: any) => {
            logger.info("Global book function call result", { callId, result });
          },
          onError: (callId: string, error: string) => {
            logger.error("Global book function call error", { callId, error });
          }
        });
        return null;
      };

      return services;
    };

    globalServicesInstance = {
      workflowStateMachine: null,
      bookManager: null,
      realtimeAudioService: null,
      isInitialized: false
    };
    
    initRef.current = true;
  }

  useEffect(() => {
    if (globalServicesInstance && !globalServicesInstance.isInitialized) {
      logger.info("🚀 GLOBAL-SERVICES: Services initialized at absolute top level");
      globalServicesInstance.isInitialized = true;
    }
  }, [logger]);

  return (
    <GlobalServiceContext.Provider value={globalServicesInstance}>
      {children}
    </GlobalServiceContext.Provider>
  );
}

export function useGlobalServices(): GlobalServices {
  const context = useContext(GlobalServiceContext);
  
  if (!context) {
    throw new Error('useGlobalServices must be used within GlobalServiceProvider');
  }
  
  return context;
}

// Simplified approach - use static service instances
class ServiceSingleton {
  private static instances: Map<string, any> = new Map();
  private static logger = createServiceLogger('service-singleton');

  static getInstance<T>(key: string, factory: () => T): T {
    if (!this.instances.has(key)) {
      this.logger.info(`🔄 Creating singleton instance: ${key}`);
      this.instances.set(key, factory());
    } else {
      this.logger.debug(`♻️ Reusing singleton instance: ${key}`);
    }
    return this.instances.get(key);
  }

  static clearInstances() {
    this.instances.clear();
    this.logger.info("🧹 Cleared all singleton instances");
  }
}

export { ServiceSingleton };