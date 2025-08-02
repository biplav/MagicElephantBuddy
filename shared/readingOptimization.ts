
export const READING_SESSION_CONFIG = {
  // Token limits for different contexts
  MAX_RESPONSE_TOKENS_READING: 150,
  MAX_RESPONSE_TOKENS_NORMAL: 300,
  
  // Context window management
  MAX_READING_MESSAGES: 6, // Keep only last 6 messages during reading
  
  // Page display optimization
  SIMPLE_PAGE_CONTEXT: true, // Use minimal page context
  
  // Auto-advance settings optimized for token usage
  SILENCE_THRESHOLD: -50,
  SILENCE_DURATION: 3000, // 3 seconds
  
  // Reading prompts - shorter versions for token efficiency
  PROMPTS: {
    START_READING: "Read this aloud:",
    CONTINUE_READING: "Next page:",
    END_BOOK: "Story finished! Say 'The End!'",
    PAGE_NAVIGATION: "Page changed. Read:",
  }
};

export const OPTIMIZED_READING_INSTRUCTIONS = `
During book reading sessions:
- Keep responses under 150 tokens
- Read the page text directly without extra commentary
- Use simple expressions like "Next page?" instead of long descriptions
- Focus on the story, not explanations
- If child asks to turn page, just read the new page text
`;
