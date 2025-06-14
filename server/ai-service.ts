import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { APPU_SYSTEM_PROMPT } from "@shared/appuPrompts";
import { getCurrentTimeContext } from "@shared/childProfile";

// Configuration types for different AI providers and models
export interface AIConfig {
  provider: 'openai' | 'gemini';
  model: string;
  maxTokens?: number;
  temperature?: number;
  audioVoice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  audioFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

// Default configurations for different use cases
export const AI_CONFIGS = {
  // Standard configuration for general conversations
  standard: {
    provider: 'openai' as const,
    model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    maxTokens: 150,
    temperature: 0.7,
    audioVoice: 'nova' as const,
    audioFormat: 'mp3' as const
  },
  
  // Fast configuration for quick responses
  fast: {
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    maxTokens: 100,
    temperature: 0.5,
    audioVoice: 'nova' as const,
    audioFormat: 'mp3' as const
  },
  
  // Creative configuration for storytelling
  creative: {
    provider: 'openai' as const,
    model: 'gpt-4o',
    maxTokens: 200,
    temperature: 0.9,
    audioVoice: 'fable' as const,
    audioFormat: 'mp3' as const
  },

  // Gemini standard configuration
  geminiStandard: {
    provider: 'gemini' as const,
    model: 'gemini-2.0-flash-exp',
    maxTokens: 150,
    temperature: 0.7,
    audioVoice: 'nova' as const,
    audioFormat: 'mp3' as const
  },

  // Gemini fast configuration
  geminiFast: {
    provider: 'gemini' as const,
    model: 'gemini-1.5-flash',
    maxTokens: 100,
    temperature: 0.5,
    audioVoice: 'nova' as const,
    audioFormat: 'mp3' as const
  },

  // Gemini creative configuration with Live API
  geminiLive: {
    provider: 'gemini' as const,
    model: 'gemini-2.0-flash-exp',
    maxTokens: 200,
    temperature: 0.9,
    audioVoice: 'fable' as const,
    audioFormat: 'mp3' as const
  }
} as const;

// Abstract AI service interface
export interface AIService {
  transcribeAudio(audioBuffer: Buffer, fileName: string): Promise<string>;
  generateResponse(text: string, config?: Partial<AIConfig>): Promise<string>;
  generateSpeech(text: string, config?: Partial<AIConfig>): Promise<Buffer>;
}

// Gemini implementation with Live API support
class GeminiService implements AIService {
  private client: GoogleGenerativeAI;
  private defaultConfig: AIConfig;

  constructor(config: AIConfig) {
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    this.defaultConfig = config;
  }

  async transcribeAudio(audioBuffer: Buffer, fileName: string): Promise<string> {
    try {
      // Note: Gemini Live API handles audio directly in multimodal conversations
      // For now, we'll fall back to OpenAI for transcription as Gemini doesn't have a separate transcription endpoint
      // In a full Live API implementation, this would be handled differently
      const openaiService = new OpenAIService({
        provider: 'openai',
        model: 'gpt-4o',
        maxTokens: 150,
        temperature: 0.7
      });
      
      return await openaiService.transcribeAudio(audioBuffer, fileName);
    } catch (error: any) {
      console.error('Gemini transcription error:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  async generateResponse(text: string, config?: Partial<AIConfig>): Promise<string> {
    const effectiveConfig = { ...this.defaultConfig, ...config };
    
    try {
      // Get current time context for personalization
      const timeContext = getCurrentTimeContext();
      
      // Create enhanced system prompt with time context
      const enhancedSystemPrompt = `${APPU_SYSTEM_PROMPT}

Current Context:
- Time: ${timeContext.currentTime}
- Time of day: ${timeContext.timeOfDay}
${timeContext.upcomingActivity ? `- Upcoming activity: ${timeContext.upcomingActivity}` : ''}
${timeContext.childMood ? `- Child's mood: ${timeContext.childMood}` : ''}

Remember to keep responses short (1-2 sentences), use simple Hinglish, and be contextually aware of the time of day.`;

      const model = this.client.getGenerativeModel({ 
        model: effectiveConfig.model,
        generationConfig: {
          maxOutputTokens: effectiveConfig.maxTokens,
          temperature: effectiveConfig.temperature
        }
      });

      const chat = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: enhancedSystemPrompt }],
          },
          {
            role: "model",
            parts: [{ text: "I understand! I'm Appu, the magical elephant who speaks in simple Hinglish with children. I'll keep my responses short and friendly." }],
          },
        ],
      });

      const result = await chat.sendMessage(text);
      const response = result.response.text();

      if (!response) {
        throw new Error('No response generated');
      }

      return response.trim();
    } catch (error: any) {
      console.error('Gemini response generation error:', error);
      throw new Error(`Response generation failed: ${error.message}`);
    }
  }

  async generateSpeech(text: string, config?: Partial<AIConfig>): Promise<Buffer> {
    // Note: Gemini doesn't have a direct TTS API yet
    // For speech synthesis, we'll fall back to OpenAI TTS
    // In a full Live API implementation, audio would be handled directly by Gemini Live
    try {
      const openaiService = new OpenAIService({
        provider: 'openai',
        model: 'gpt-4o',
        maxTokens: 150,
        temperature: 0.7,
        audioVoice: config?.audioVoice || this.defaultConfig.audioVoice,
        audioFormat: config?.audioFormat || this.defaultConfig.audioFormat
      });
      
      return await openaiService.generateSpeech(text, config);
    } catch (error: any) {
      console.error('Gemini speech generation error:', error);
      throw new Error(`Speech generation failed: ${error.message}`);
    }
  }
}

// OpenAI implementation
class OpenAIService implements AIService {
  private client: OpenAI;
  private defaultConfig: AIConfig;

  constructor(config: AIConfig) {
    this.client = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
    this.defaultConfig = config;
  }

  async transcribeAudio(audioBuffer: Buffer, fileName: string): Promise<string> {
    try {
      // Create a file-like object for the API
      const file = new File([audioBuffer], fileName, { 
        type: 'audio/wav' 
      });

      const transcription = await this.client.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'en',
        response_format: 'text'
      });

      return transcription.trim();
    } catch (error: any) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  async generateResponse(text: string, config?: Partial<AIConfig>): Promise<string> {
    const effectiveConfig = { ...this.defaultConfig, ...config };
    
    try {
      // Get current time context for personalization
      const timeContext = getCurrentTimeContext();
      
      // Create enhanced system prompt with time context
      const enhancedSystemPrompt = `${APPU_SYSTEM_PROMPT}

Current Context:
- Time: ${timeContext.currentTime}
- Time of day: ${timeContext.timeOfDay}
${timeContext.upcomingActivity ? `- Upcoming activity: ${timeContext.upcomingActivity}` : ''}
${timeContext.childMood ? `- Child's mood: ${timeContext.childMood}` : ''}

Remember to keep responses short (1-2 sentences), use simple Hinglish, and be contextually aware of the time of day.`;

      const completion = await this.client.chat.completions.create({
        model: effectiveConfig.model,
        messages: [
          {
            role: 'system',
            content: enhancedSystemPrompt
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: effectiveConfig.maxTokens,
        temperature: effectiveConfig.temperature
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response generated');
      }

      return response.trim();
    } catch (error: any) {
      console.error('Response generation error:', error);
      throw new Error(`Response generation failed: ${error.message}`);
    }
  }

  async generateSpeech(text: string, config?: Partial<AIConfig>): Promise<Buffer> {
    const effectiveConfig = { ...this.defaultConfig, ...config };
    
    try {
      const response = await this.client.audio.speech.create({
        model: 'tts-1',
        voice: effectiveConfig.audioVoice || 'nova',
        input: text,
        response_format: effectiveConfig.audioFormat || 'mp3'
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer;
    } catch (error: any) {
      console.error('Speech generation error:', error);
      throw new Error(`Speech generation failed: ${error.message}`);
    }
  }
}

// Factory function to create AI service instances
export function createAIService(configName: keyof typeof AI_CONFIGS = 'standard'): AIService {
  const config = AI_CONFIGS[configName];
  
  switch (config.provider) {
    case 'openai':
      return new OpenAIService(config as AIConfig);
    case 'gemini':
      return new GeminiService(config as AIConfig);
    default:
      throw new Error(`Unsupported AI provider: ${(config as AIConfig).provider}`);
  }
}

// Convenience function to get AI service with custom config
export function createCustomAIService(customConfig: AIConfig): AIService {
  switch (customConfig.provider) {
    case 'openai':
      return new OpenAIService(customConfig);
    case 'gemini':
      return new GeminiService(customConfig);
    default:
      throw new Error(`Unsupported AI provider: ${customConfig.provider}`);
  }
}

// Export default service instance
export const defaultAIService = createAIService('standard');