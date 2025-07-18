
import { EventEmitter } from 'events';

interface WorkflowMetrics {
  totalWorkflows: number;
  successfulWorkflows: number;
  failedWorkflows: number;
  averageProcessingTime: number;
  errorsByStep: Record<string, number>;
  lastProcessedAt: Date | null;
}

class WorkflowMonitor extends EventEmitter {
  private metrics: WorkflowMetrics = {
    totalWorkflows: 0,
    successfulWorkflows: 0,
    failedWorkflows: 0,
    averageProcessingTime: 0,
    errorsByStep: {},
    lastProcessedAt: null
  };

  private processingTimes: number[] = [];

  startWorkflow(workflowId: string): { startTime: number } {
    this.metrics.totalWorkflows++;
    const startTime = Date.now();
    
    console.log(`🎯 Workflow ${workflowId} started`);
    this.emit('workflow_started', { workflowId, startTime });
    
    return { startTime };
  }

  completeWorkflow(workflowId: string, startTime: number, success: boolean, errors: string[] = []): void {
    const processingTime = Date.now() - startTime;
    this.processingTimes.push(processingTime);

    if (success) {
      this.metrics.successfulWorkflows++;
      console.log(`✅ Workflow ${workflowId} completed successfully in ${processingTime}ms`);
    } else {
      this.metrics.failedWorkflows++;
      console.log(`❌ Workflow ${workflowId} failed after ${processingTime}ms`);
      
      // Track errors by step
      errors.forEach(error => {
        const step = this.extractStepFromError(error);
        this.metrics.errorsByStep[step] = (this.metrics.errorsByStep[step] || 0) + 1;
      });
    }

    // Update average processing time
    this.metrics.averageProcessingTime = 
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;

    this.metrics.lastProcessedAt = new Date();

    this.emit('workflow_completed', { 
      workflowId, 
      processingTime, 
      success, 
      errors 
    });
  }

  private extractStepFromError(error: string): string {
    // Extract step name from error message
    const stepPatterns = [
      /transcription/i,
      /context/i,
      /response/i,
      /speech/i,
      /storage/i,
      /memory/i
    ];

    for (const pattern of stepPatterns) {
      if (pattern.test(error)) {
        return pattern.source.replace(/[^a-zA-Z]/g, '').toLowerCase();
      }
    }

    return 'unknown';
  }

  getMetrics(): WorkflowMetrics {
    return { ...this.metrics };
  }

  getHealthStatus(): { status: 'healthy' | 'warning' | 'critical', details: any } {
    const successRate = this.metrics.totalWorkflows > 0 
      ? this.metrics.successfulWorkflows / this.metrics.totalWorkflows 
      : 1;

    if (successRate >= 0.95) {
      return { status: 'healthy', details: { successRate, avgTime: this.metrics.averageProcessingTime } };
    } else if (successRate >= 0.8) {
      return { status: 'warning', details: { successRate, topErrors: this.getTopErrors() } };
    } else {
      return { status: 'critical', details: { successRate, topErrors: this.getTopErrors() } };
    }
  }

  private getTopErrors(): Array<{ step: string, count: number }> {
    return Object.entries(this.metrics.errorsByStep)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([step, count]) => ({ step, count }));
  }

  reset(): void {
    this.metrics = {
      totalWorkflows: 0,
      successfulWorkflows: 0,
      failedWorkflows: 0,
      averageProcessingTime: 0,
      errorsByStep: {},
      lastProcessedAt: null
    };
    this.processingTimes = [];
  }
}

export const workflowMonitor = new WorkflowMonitor();
