import React, { createContext, useContext, useRef, useEffect } from 'react';
import { createServiceLogger } from '@/lib/logger';
import { useBookManager } from '@/hooks/useBookManager';
import { useWorkflowStateMachine } from '@/hooks/useWorkflowStateMachine';

interface ServiceManagerContextType {
  bookManager: ReturnType<typeof useBookManager>;
  workflowStateMachine: ReturnType<typeof useWorkflowStateMachine>;
  isInitialized: boolean;
}

const ServiceManagerContext = createContext<ServiceManagerContextType | null>(null);

interface ServiceManagerProviderProps {
  children: React.ReactNode;
}

export function ServiceManagerProvider({ children }: ServiceManagerProviderProps) {
  const logger = createServiceLogger('service-manager');
  const initializationRef = useRef(false);
  const servicesRef = useRef<ServiceManagerContextType | null>(null);

  // Initialize ALL core services ONCE at the top level
  const workflowStateMachine = useWorkflowStateMachine();
  
  const bookManager = useBookManager({
    workflowStateMachine,
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

  // Create stable services object that never changes reference
  if (!servicesRef.current) {
    servicesRef.current = {
      bookManager,
      workflowStateMachine,
      isInitialized: true
    };
  }

  // Track initialization to ensure single instance
  useEffect(() => {
    if (!initializationRef.current) {
      initializationRef.current = true;
      logger.info("🚀 SERVICE-MANAGER: All core services initialized ONCE at global level");
    }
  }, [logger]);

  return (
    <ServiceManagerContext.Provider value={servicesRef.current}>
      {children}
    </ServiceManagerContext.Provider>
  );
}

export function useGlobalServices(): ServiceManagerContextType {
  const context = useContext(ServiceManagerContext);
  
  if (!context) {
    throw new Error('useGlobalServices must be used within ServiceManagerProvider');
  }
  
  return context;
}

// Individual service hooks for backward compatibility
export function useGlobalBookManager() {
  const { bookManager } = useGlobalServices();
  return bookManager;
}

export function useGlobalWorkflowStateMachine() {
  const { workflowStateMachine } = useGlobalServices();
  return workflowStateMachine;
}