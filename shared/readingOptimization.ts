
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
  
  // Reading prompts - shorter versions for token efficiency with Hinglish
  PROMPTS: {
    START_READING: "Read this in Hinglish (Hindi-English mix):",
    CONTINUE_READING: "Agle page par jaate hain:",
    END_BOOK: "Kahani khatam! Story finished! Say 'The End!'",
    PAGE_NAVIGATION: "Page badal gaya. Read in Hinglish:",
  }
};

export const OPTIMIZED_READING_INSTRUCTIONS = `
During book reading sessions:
- Keep responses under 150 tokens
- Read English books in Hinglish (Hindi-English mix) to make them engaging
- Use Hindi expressions like "dekho", "kya baat hai", "wah", "aur phir"
- Mix simple Hindi words with English naturally
- Use simple expressions like "Agle page chahiye?" instead of long descriptions
- Focus on the story, not explanations
- Make reading interactive and playful with Hinglish expressions
`;
