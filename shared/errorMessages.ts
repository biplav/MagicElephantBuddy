/**
 * Centralized error messages for the application
 * Add new error types and messages here as needed
 */

interface ErrorState {
  userMessage: string;
  debugMessage: string;
}

// Error messages map by error type
export const errorMessages: Record<string, ErrorState> = {
  // Rate limit errors (usually from exceeding API quotas)
  rateLimit: {
    userMessage: "I'm feeling a bit tired right now. Can we talk again in a little bit?",
    debugMessage: "API rate limit exceeded or quota reached"
  },
  
  // Network errors
  network: {
    userMessage: "I can't hear you very well. Please check your internet connection and try again.",
    debugMessage: "Network connection issue detected"
  },
  
  // Authentication errors
  auth: {
    userMessage: "I need to take a quick break. Please try again later.",
    debugMessage: "API authentication or key issues"
  },
  
  // Service unavailable errors
  serviceUnavailable: {
    userMessage: "I'm having trouble thinking right now. Can we try again soon?",
    debugMessage: "OpenAI service is currently unavailable"
  },
  
  // Generic errors (fallback)
  generic: {
    userMessage: "Oops! Something went wrong. Let's try again.",
    debugMessage: "An unexpected error occurred"
  },
  
  // Transcription-specific errors
  transcriptionFailed: {
    userMessage: "I couldn't quite understand what you said. Could you try speaking again?",
    debugMessage: "Audio transcription failed"
  },
  
  // Response generation errors
  responseFailed: {
    userMessage: "I'm not sure how to respond to that. Can you ask me something else?",
    debugMessage: "Failed to generate a response"
  }
};

// Helper function to get appropriate error message
export function getErrorMessage(errorType: string): ErrorState {
  return errorMessages[errorType] || errorMessages.generic;
}