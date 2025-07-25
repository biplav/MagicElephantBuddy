
import { memoryService } from './memory-service';
import { createServiceLogger } from './logger';

const memoryFormationLogger = createServiceLogger('memory-formation');

export class MemoryFormationService {
  
  extractConcepts(content: string): string[] {
    const concepts = [];
    const lowerContent = content.toLowerCase();
    
    // Basic concept extraction
    const conceptWords = ['dinosaur', 'color', 'number', 'alphabet', 'animal', 'food', 'story', 'song', 'game'];
    for (const concept of conceptWords) {
      if (lowerContent.includes(concept)) {
        concepts.push(concept);
      }
    }
    
    return concepts;
  }

  containsLearningContent(content: string): boolean {
    const learningIndicators = ['count', 'alphabet', 'color', 'shape', 'number', 'learn', 'teach'];
    return learningIndicators.some(indicator => content.toLowerCase().includes(indicator));
  }

  detectEmotion(content: string): string | null {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('happy') || lowerContent.includes('joy') || lowerContent.includes('excited')) return 'happy';
    if (lowerContent.includes('sad') || lowerContent.includes('cry')) return 'sad';
    if (lowerContent.includes('scared') || lowerContent.includes('afraid')) return 'scared';
    if (lowerContent.includes('angry') || lowerContent.includes('mad')) return 'angry';
    
    return null;
  }

  async formMemoryFromContent(childId: number, content: string, role: 'user' | 'assistant', conversationId: number): Promise<void> {
    try {
      if (role === 'user') {
        // Child's message - analyze for interests, emotions, learning content
        const childMessage = content.toLowerCase();
        
        // Detect conversational memories
        if (childMessage.includes('love') || childMessage.includes('like') || childMessage.includes('favorite')) {
          await memoryService.createMemory(
            childId,
            `Child expressed interest: "${content}"`,
            'conversational',
            {
              conversationId,
              emotionalTone: 'positive',
              concepts: this.extractConcepts(content),
              importance_score: 0.7
            }
          );
        }
        
        // Detect learning content
        if (this.containsLearningContent(content)) {
          await memoryService.createMemory(
            childId,
            `Learning interaction: "${content}"`,
            'learning',
            {
              conversationId,
              concepts: this.extractConcepts(content),
              learning_outcome: 'engagement'
            }
          );
        }
        
        // Detect emotional expressions
        const emotion = this.detectEmotion(content);
        if (emotion) {
          await memoryService.createMemory(
            childId,
            `Child showed ${emotion} emotion: "${content}"`,
            'emotional',
            {
              conversationId,
              emotionalTone: emotion,
              concepts: [emotion]
            }
          );
        }
        
      } else {
        // Appu's response - track teaching moments and relationship building
        if (content.includes('great job') || content.includes('wonderful') || content.includes('proud')) {
          await memoryService.createMemory(
            childId,
            `Appu provided encouragement: "${content}"`,
            'conversational',
            {
              conversationId,
              emotionalTone: 'supportive',
              concepts: ['encouragement', 'learning'],
              importance_score: 0.6
            }
          );
        }
      }
    } catch (error: any) {
      memoryFormationLogger.error('Error forming memory from content', { 
        error: error.message, 
        childId, 
        role,
        conversationId 
      });
    }
  }
}

export const memoryFormationService = new MemoryFormationService();
