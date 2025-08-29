import React, { createContext, useContext, useRef, useEffect } from 'react';
import { createServiceLogger } from '@/lib/logger';
import { useWorkflowStateMachine } from '@/hooks/useWorkflowStateMachine';
import { useMediaManager } from '@/hooks/useMediaManager';
import { useOpenAIEventTranslator } from '@/hooks/useOpenAIEventTranslator';

interface ServiceManagerContextType {
  workflowStateMachine: ReturnType<typeof useWorkflowStateMachine>;
  mediaManager: ReturnType<typeof useMediaManager>;
  openaiEventTranslator: ReturnType<typeof useOpenAIEventTranslator>;
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

  // Initialize core services ONCE at the top level (book state now handled by Redux)
  const workflowStateMachine = useWorkflowStateMachine();
  const mediaManager = useMediaManager({ enableVideo: false });
  const openaiEventTranslator = useOpenAIEventTranslator();

  // Create stable services object that never changes reference
  if (!servicesRef.current) {
    servicesRef.current = {
      workflowStateMachine,
      mediaManager,
      openaiEventTranslator,
      isInitialized: true
    };
  }

  // Track initialization to ensure single instance
  useEffect(() => {
    if (!initializationRef.current) {
      initializationRef.current = true;
      logger.info("🚀 SERVICE-MANAGER: Core services initialized (book state handled by Redux)");
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