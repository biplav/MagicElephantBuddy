import { createAIService } from "./ai-service";
import { storage } from "./storage";
import type { Conversation, Message, Child } from "@shared/schema";

interface ConversationSummary {
  conversationId: number;
  summary: string;
  keyTopics: string[];
  emotionalTone: string;
  learningAchievements: string[];
  parentRecommendations: string[];
}

interface ProfileSuggestion {
  type: 'likes' | 'dislikes' | 'favoriteThings' | 'learningGoals' | 'dailyRoutine';
  category?: string; // For favoriteThings like 'colors', 'animals', etc.
  value: string | string[];
  confidence: number; // 0-100
  evidence: string; // Quote from conversation supporting this suggestion
  action: 'add' | 'update' | 'remove';
}

interface ChildProfileUpdate {
  childId: number;
  childName: string;
  suggestions: ProfileSuggestion[];
  conversationId: number;
  createdAt: Date;
}

export class ConversationAnalyzer {
  private aiService = createAIService('creative');

  // Generate comprehensive conversation summary
  async generateConversationSummary(conversation: Conversation, messages: Message[]): Promise<ConversationSummary> {
    try {
      const conversationText = messages
        .map(msg => `${msg.type}: ${msg.content || msg.transcription || ''}`)
        .join('\n');

      const prompt = `
Analyze this conversation between a child and Appu (AI companion). Provide a comprehensive summary in JSON format:

Conversation:
${conversationText}

Please return a JSON object with:
{
  "summary": "Brief 2-3 sentence summary of the conversation",
  "keyTopics": ["topic1", "topic2", "topic3"], // Main subjects discussed
  "emotionalTone": "happy|excited|calm|frustrated|curious|playful", // Child's overall emotional state
  "learningAchievements": ["achievement1", "achievement2"], // What the child learned or practiced
  "parentRecommendations": ["recommendation1", "recommendation2"] // Suggestions for parents based on this conversation
}

Focus on educational content, emotional development, and behavioral observations.
`;

      const response = await this.aiService.generateResponse(prompt);
      
      // Clean up markdown formatting if present
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(cleanedResponse);

      return {
        conversationId: conversation.id,
        summary: parsed.summary,
        keyTopics: parsed.keyTopics || [],
        emotionalTone: parsed.emotionalTone,
        learningAchievements: parsed.learningAchievements || [],
        parentRecommendations: parsed.parentRecommendations || [],
      };
    } catch (error) {
      console.error('Error generating conversation summary:', error);
      // Fallback summary
      return {
        conversationId: conversation.id,
        summary: `Conversation with ${messages.length} messages discussing various topics.`,
        keyTopics: [],
        emotionalTone: 'neutral',
        learningAchievements: [],
        parentRecommendations: [],
      };
    }
  }

  // Extract potential profile updates from conversation
  async extractProfileSuggestions(child: Child, conversation: Conversation, messages: Message[]): Promise<ProfileSuggestion[]> {
    try {
      const conversationText = messages
        .map(msg => `${msg.type}: ${msg.content || msg.transcription || ''}`)
        .join('\n');

      const currentProfile = JSON.stringify(child.profile, null, 2);

      const prompt = `
Analyze this conversation to identify NEW information about the child that could update their profile.

Current Child Profile:
${currentProfile}

Recent Conversation:
${conversationText}

Look for NEW preferences, interests, dislikes, or behavioral patterns that are NOT already in the profile.

Return a JSON array of suggestions with this format:
[
  {
    "type": "likes|dislikes|favoriteThings|learningGoals|dailyRoutine",
    "category": "colors|animals|activities|foods|characters", // Only for favoriteThings
    "value": "new_item_or_array",
    "confidence": 85, // 0-100 how confident you are
    "evidence": "exact quote from conversation",
    "action": "add|update|remove"
  }
]

Only suggest items with confidence > 70 and clear evidence from the conversation.
Ignore information already present in the current profile.
`;

      const response = await this.aiService.generateResponse(prompt);
      
      // Clean up markdown formatting if present
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const suggestions = JSON.parse(cleanedResponse);

      // Validate and filter suggestions
      return suggestions.filter((suggestion: ProfileSuggestion) => 
        suggestion.confidence > 70 && 
        suggestion.evidence && 
        suggestion.value
      );
    } catch (error) {
      console.error('Error extracting profile suggestions:', error);
      return [];
    }
  }

  // Process a single conversation for summary and profile updates
  async processConversation(conversationId: number): Promise<void> {
    try {
      const messages = await storage.getMessagesByConversation(conversationId);
      if (messages.length === 0) return;

      // Get conversation details
      const conversation = await storage.getConversationsByChild(messages[0].conversationId, 1);
      if (conversation.length === 0) return;

      const conv = conversation[0];
      const child = await storage.getChild(conv.childId);
      if (!child) return;

      // Generate conversation summary
      const summary = await this.generateConversationSummary(conv, messages);

      // Store conversation insights with summary
      await storage.createConversationInsight({
        conversationId: conv.id,
        summary: summary.summary,
        emotionalTone: summary.emotionalTone,
        topics: summary.keyTopics,
        learningGoalsAddressed: summary.learningAchievements,
        parentalRecommendations: summary.parentRecommendations.join('; '),
      });

      // Extract profile suggestions
      const profileSuggestions = await this.extractProfileSuggestions(child, conv, messages);

      if (profileSuggestions.length > 0) {
        // Store profile update suggestions
        await storage.createProfileUpdateSuggestion({
          childId: child.id,
          conversationId: conv.id,
          suggestions: profileSuggestions,
          status: 'pending',
        });

        // Create notification for parent
        await storage.createNotification({
          parentId: child.parentId,
          childId: child.id,
          type: 'profile_update',
          title: 'Profile Update Suggestions',
          message: `We discovered ${profileSuggestions.length} new things about ${child.name} from their recent conversation. Review suggestions to update their profile.`,
          priority: 'normal',
        });
      }

      console.log(`Processed conversation ${conversationId}: ${summary.keyTopics.length} topics, ${profileSuggestions.length} profile suggestions`);
    } catch (error) {
      console.error(`Error processing conversation ${conversationId}:`, error);
    }
  }

  // Process conversations from the past hour only
  async processUnanalyzedConversations(): Promise<void> {
    try {
      // Get all conversations without insights
      const allUnanalyzed = await storage.getConversationsWithoutSummary();
      
      // Filter to only conversations from the past hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentConversations = allUnanalyzed.filter(conv => 
        conv.endTime && new Date(conv.endTime) >= oneHourAgo
      );
      
      if (recentConversations.length === 0) {
        console.log('No new conversations from the past hour to analyze');
        return;
      }
      
      console.log(`Processing ${recentConversations.length} conversations from the past hour`);
      
      for (const conversation of recentConversations) {
        await this.processConversation(conversation.id);
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error processing unanalyzed conversations:', error);
    }
  }
}

export const conversationAnalyzer = new ConversationAnalyzer();