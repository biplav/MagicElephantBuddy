/**
 * Centralized error messages for the application
 * Add new error types and messages here as needed
 */

interface ErrorState {
  userMessage: string;
  debugMessage: string;
}

export const errorMessages: Record<string, ErrorState> = {
  // Generic error
  generic: {
    userMessage: "Oops! Something went wrong. Let's try again.",
    debugMessage: "An unexpected error occurred."
  },
  
  // Network-related errors
  network: {
    userMessage: "I can't hear you very well. Please check your internet connection and try again.",
    debugMessage: "Network connection error or request timeout."
  },
  
  // Authentication errors
  auth: {
    userMessage: "I need to take a quick break. Please try again later.",
    debugMessage: "API authentication error. Check your API key."
  },
  
  // Rate limiting errors
  rateLimit: {
    userMessage: "I'm feeling a bit tired right now. Can we talk again in a little bit?",
    debugMessage: "API rate limit exceeded or quota exhausted."
  },
  
  // Server errors
  serviceUnavailable: {
    userMessage: "I'm having trouble thinking right now. Can we try again soon?",
    debugMessage: "Service unavailable or internal server error."
  },
  
  // Microphone errors
  microphoneNotAvailable: {
    userMessage: "I can't hear you. Please allow me to use your microphone.",
    debugMessage: "Microphone access denied or device not available."
  },
  
  // Audio processing errors
  audioProcessingError: {
    userMessage: "I couldn't understand that. Could you please speak more clearly?",
    debugMessage: "Error processing audio data."
  },
  
  // Text processing errors
  textProcessingError: {
    userMessage: "I didn't understand what you said. Let's try again!",
    debugMessage: "Error processing text data."
  }
};

export function getErrorMessage(errorType: string): ErrorState {
  return errorMessages[errorType] || errorMessages.generic;
}