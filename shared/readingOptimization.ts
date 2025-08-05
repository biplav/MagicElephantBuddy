
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
  
  // Reading prompts - for silent reading mode with audio playback
  PROMPTS: {
    START_READING: "Book audio will play. I'll answer if you have questions:",
    CONTINUE_READING: "Next page loading...",
    END_BOOK: "Kahani khatam! Story finished! Say 'The End!'",
    PAGE_NAVIGATION: "New page ready. Audio will play automatically:",
  }
};

export const OPTIMIZED_READING_INSTRUCTIONS = `
During book reading sessions:
- Keep responses under 150 tokens
- DO NOT read the book content aloud - audio will auto-play
- Only respond if child asks questions or needs help
- Wait for child interaction before speaking
- If child asks about story, give brief encouraging responses
- Use simple expressions like "Good question!" or "What do you think?"
- Focus on child's questions, not narrating the story
- Stay silent during audio playback unless child interrupts
`;
