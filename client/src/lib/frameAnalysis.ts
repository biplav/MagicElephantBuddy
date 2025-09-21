/**
 * Frame Analysis Utility
 *
 * This module provides a decoupled interface for frame analysis that can be used
 * both by the GetEye page and integrated into the LLM getEyesTool workflow.
 */

export interface FrameAnalysisRequest {
  frameData: string;
  reason: string;
  lookingFor: string;
  context: string;
  childId?: string;
  conversationId?: string | number;
}

export interface FrameAnalysisResponse {
  success: boolean;
  analysis: string;
  confidence?: number;
  error?: string;
  metadata?: {
    timestamp: string;
    processingTime: number;
    modelUsed: string;
  };
}

/**
 * Analyzes a captured frame using the backend /api/analyze-frame endpoint
 */
export async function analyzeFrame(request: FrameAnalysisRequest): Promise<FrameAnalysisResponse> {
  try {
    console.log('🔍 Starting frame analysis:', {
      reason: request.reason,
      lookingFor: request.lookingFor,
      context: request.context,
      childId: request.childId,
      frameDataLength: request.frameData.length
    });

    const startTime = Date.now();

    const response = await fetch('/api/analyze-frame', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        frameData: request.frameData,
        childId: request.childId,
        reason: request.reason,
        lookingFor: request.lookingFor,
        context: request.context,
        conversationId: request.conversationId,
        timestamp: Date.now(),
      }),
    });

    const processingTime = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Analysis failed with status ${response.status}`);
    }

    const result = await response.json();

    console.log('✅ Frame analysis completed:', {
      success: result.success,
      processingTime,
      analysisLength: result.analysis?.length || 0
    });

    return {
      success: true,
      analysis: result.analysis || result.description || 'No analysis provided',
      confidence: result.confidence,
      metadata: {
        timestamp: new Date().toISOString(),
        processingTime,
        modelUsed: result.model || 'gpt-4o'
      }
    };

  } catch (error) {
    console.error('❌ Frame analysis failed:', error);

    return {
      success: false,
      analysis: '',
      error: error instanceof Error ? error.message : 'Unknown analysis error'
    };
  }
}

/**
 * Validates frame data before sending for analysis
 */
export function validateFrameData(frameData: string): { valid: boolean; error?: string } {
  if (!frameData) {
    return { valid: false, error: 'No frame data provided' };
  }

  if (!frameData.startsWith('data:image/')) {
    return { valid: false, error: 'Invalid frame data format - must be a data URL' };
  }

  // Check approximate size (base64 encoded image should be reasonable)
  const sizeEstimate = (frameData.length * 3) / 4; // Convert base64 length to bytes
  const maxSize = 10 * 1024 * 1024; // 10MB limit

  if (sizeEstimate > maxSize) {
    return { valid: false, error: 'Frame data too large (max 10MB)' };
  }

  return { valid: true };
}

/**
 * Prepares frame data for analysis by ensuring proper format
 */
export function prepareFrameData(rawFrameData: string): string {
  // If it's already a data URL, return as-is
  if (rawFrameData.startsWith('data:image/')) {
    return rawFrameData;
  }

  // If it's base64 without data URL prefix, add it
  if (!rawFrameData.startsWith('http') && !rawFrameData.startsWith('/')) {
    return `data:image/jpeg;base64,${rawFrameData}`;
  }

  // Otherwise return as-is (might be a URL)
  return rawFrameData;
}

/**
 * Creates standardized analysis context for different use cases
 */
export const AnalysisContexts = {
  userInitiated: (description: string = 'general analysis') => ({
    reason: 'User requested frame analysis',
    lookingFor: description,
    context: 'User initiated capture from GetEye page'
  }),

  llmToolCall: (lookingFor: string, context: string) => ({
    reason: 'AI assistant requested visual analysis',
    lookingFor,
    context
  }),

  automaticCapture: (trigger: string) => ({
    reason: 'Automatic frame capture triggered',
    lookingFor: 'general scene analysis',
    context: `Triggered by: ${trigger}`
  }),

  learningActivity: (activity: string, objective: string) => ({
    reason: `Educational activity: ${activity}`,
    lookingFor: objective,
    context: `Learning context: ${activity}`
  })
};

/**
 * Format analysis result for display in different contexts
 */
export function formatAnalysisForDisplay(
  result: FrameAnalysisResponse,
  options: { includeMetadata?: boolean; maxLength?: number } = {}
): string {
  if (!result.success) {
    return `Analysis failed: ${result.error || 'Unknown error'}`;
  }

  let formatted = result.analysis;

  // Truncate if needed
  if (options.maxLength && formatted.length > options.maxLength) {
    formatted = formatted.substring(0, options.maxLength - 3) + '...';
  }

  // Add metadata if requested
  if (options.includeMetadata && result.metadata) {
    formatted += `\n\n(Analyzed in ${result.metadata.processingTime}ms using ${result.metadata.modelUsed})`;
  }

  return formatted;
}

/**
 * Retry analysis with exponential backoff
 */
export async function analyzeFrameWithRetry(
  request: FrameAnalysisRequest,
  maxRetries: number = 3
): Promise<FrameAnalysisResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await analyzeFrame(request);

      if (result.success) {
        return result;
      }

      // If it's a server error (not client error), retry
      if (result.error?.includes('50') || result.error?.includes('timeout')) {
        lastError = new Error(result.error);
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`🔄 Retrying analysis in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      return result; // Return the failed result for client errors
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`🔄 Retrying analysis in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return {
    success: false,
    analysis: '',
    error: `Analysis failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  };
}