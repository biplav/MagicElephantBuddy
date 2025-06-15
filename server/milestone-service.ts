import { storage } from "./storage";
import type { Message, Child, LearningMilestone } from "@shared/schema";

// Helper functions for milestone analysis
function extractNumbers(text: string): number {
  const matches = text.match(/\d+/g);
  return matches ? Math.max(...matches.map(Number)) : 0;
}

function extractLetters(text: string): number {
  const letterMatches = text.match(/[A-Z]/g);
  return letterMatches ? letterMatches.length : 0;
}

function extractColors(text: string): number {
  const colors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'brown', 'gray', 'grey'];
  const foundColors = new Set();
  colors.forEach(color => {
    if (new RegExp(color, 'gi').test(text)) {
      foundColors.add(color);
    }
  });
  return foundColors.size;
}

function extractShapes(text: string): number {
  const shapes = ['circle', 'square', 'triangle', 'rectangle', 'star', 'heart', 'diamond', 'oval'];
  const foundShapes = new Set();
  shapes.forEach(shape => {
    if (new RegExp(shape, 'gi').test(text)) {
      foundShapes.add(shape);
    }
  });
  return foundShapes.size;
}

function extractWords(text: string): number {
  const words = text.split(/\s+/).filter(word => word.length >= 4);
  return words.length;
}

function extractSocialWords(text: string): number {
  const socialWords = ['please', 'thank you', 'thanks', 'sorry', 'excuse me', 'share', 'help', 'friend', 'kind', 'nice'];
  let count = 0;
  socialWords.forEach(word => {
    const matches = text.match(new RegExp(word, 'gi'));
    if (matches) count += matches.length;
  });
  return count;
}

// Learning milestone patterns to detect from conversations
export const MILESTONE_PATTERNS = {
  counting: {
    regex: /count(?:ing)?\s+(?:to\s+)?(\d+)|(\d+)\s*(?:numbers?|count)/gi,
  },
  alphabet: {
    regex: /alphabet|letters?|A\s*B\s*C|spell(?:ing)?/gi,
  },
  colors: {
    regex: /(?:red|blue|green|yellow|orange|purple|pink|black|white|brown|gray|grey)\s+color|color(?:s)?|what\s+color/gi,
  },
  shapes: {
    regex: /(?:circle|square|triangle|rectangle|star|heart|diamond|oval)\s+shape|shape(?:s)?/gi,
  },
  vocabulary: {
    regex: /new\s+word|learn(?:ed|ing)\s+word|what\s+(?:does|is)|means?/gi,
  },
  social_skills: {
    regex: /(?:please|thank\s+you|sorry|excuse\s+me|share|help|friend|kind|nice)/gi,
  }
};

// Default milestones for new children
export const DEFAULT_MILESTONES = [
  {
    milestoneType: 'counting',
    milestoneDescription: 'Count to 10',
    targetValue: 10,
  },
  {
    milestoneType: 'counting',
    milestoneDescription: 'Count to 20',
    targetValue: 20,
  },
  {
    milestoneType: 'alphabet',
    milestoneDescription: 'Recognize 10 letters',
    targetValue: 10,
  },
  {
    milestoneType: 'colors',
    milestoneDescription: 'Identify 5 colors',
    targetValue: 5,
  },
  {
    milestoneType: 'shapes',
    milestoneDescription: 'Recognize 4 basic shapes',
    targetValue: 4,
  },
  {
    milestoneType: 'vocabulary',
    milestoneDescription: 'Learn 50 new words',
    targetValue: 50,
  },
  {
    milestoneType: 'social_skills',
    milestoneDescription: 'Use polite words regularly',
    targetValue: 20,
  }
];

export class MilestoneService {
  // Initialize default milestones for a new child
  async initializeMilestonesForChild(childId: number): Promise<void> {
    try {
      for (const milestone of DEFAULT_MILESTONES) {
        await storage.createLearningMilestone({
          childId,
          ...milestone,
        });
      }
    } catch (error) {
      console.error('Error initializing milestones for child:', error);
    }
  }

  // Analyze conversation messages for learning progress
  async analyzeConversationForProgress(childId: number, messages: Message[]): Promise<void> {
    try {
      const milestones = await storage.getMilestonesByChild(childId);
      const child = await storage.getChild(childId);
      
      if (!child) return;

      // Combine all message content for analysis
      const conversationText = messages
        .map(msg => msg.content || msg.transcription || '')
        .join(' ');

      for (const milestone of milestones) {
        if (milestone.isCompleted) continue;

        const pattern = MILESTONE_PATTERNS[milestone.milestoneType as keyof typeof MILESTONE_PATTERNS];
        if (!pattern) continue;

        let progress = 0;
        
        // Extract progress based on milestone type
        switch (milestone.milestoneType) {
          case 'counting':
            progress = extractNumbers(conversationText);
            break;
          case 'alphabet':
            progress = extractLetters(conversationText);
            break;
          case 'colors':
            progress = extractColors(conversationText);
            break;
          case 'shapes':
            progress = extractShapes(conversationText);
            break;
          case 'vocabulary':
            progress = extractWords(conversationText);
            break;
          case 'social_skills':
            progress = extractSocialWords(conversationText);
            break;
        }

        // Update progress if there's improvement
        if (progress > milestone.currentProgress) {
          await storage.updateMilestoneProgress(milestone.id, Math.min(progress, milestone.targetValue || 100));
          
          // Create progress notification
          await storage.createNotification({
            parentId: child.parentId,
            childId: milestone.childId,
            milestoneId: milestone.id,
            type: 'progress_update',
            title: 'Learning Progress!',
            message: `${child.name} is making progress on: ${milestone.milestoneDescription} (${progress}/${milestone.targetValue})`,
            priority: 'normal'
          });

          // Check if milestone is completed
          if (progress >= (milestone.targetValue || 100)) {
            await storage.completeMilestone(milestone.id);
            
            // Create milestone achievement notification
            await storage.createNotification({
              parentId: child.parentId,
              childId: milestone.childId,
              milestoneId: milestone.id,
              type: 'milestone_achieved',
              title: 'Milestone Achieved! 🎉',
              message: `${child.name} has completed: ${milestone.milestoneDescription}`,
              priority: 'high'
            });
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing conversation for progress:', error);
    }
  }

  // Generate encouragement notifications based on child's activity
  async generateEncouragementNotification(childId: number): Promise<void> {
    try {
      const child = await storage.getChild(childId);
      const milestones = await storage.getMilestonesByChild(childId);
      
      if (!child) return;

      const inProgressMilestones = milestones.filter(m => !m.isCompleted && m.currentProgress > 0);
      
      if (inProgressMilestones.length > 0) {
        const randomMilestone = inProgressMilestones[Math.floor(Math.random() * inProgressMilestones.length)];
        
        await storage.createNotification({
          parentId: child.parentId,
          childId: child.id,
          milestoneId: randomMilestone.id,
          type: 'encouragement',
          title: 'Keep Going!',
          message: `${child.name} is doing great with ${randomMilestone.milestoneDescription}. Encourage them to keep practicing!`,
          priority: 'low'
        });
      }
    } catch (error) {
      console.error('Error generating encouragement notification:', error);
    }
  }

  // Generate daily summary notifications
  async generateDailySummary(parentId: number): Promise<void> {
    try {
      const children = await storage.getChildrenByParent(parentId);
      
      for (const child of children) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const conversations = await storage.getConversationsByChild(child.id, 5);
        const todayConversations = conversations.filter(conv => 
          new Date(conv.startTime) >= todayStart
        );

        if (todayConversations.length > 0) {
          const totalMessages = todayConversations.reduce((sum, conv) => sum + conv.totalMessages, 0);
          
          await storage.createNotification({
            parentId: parentId,
            childId: child.id,
            type: 'daily_summary',
            title: 'Daily Summary',
            message: `${child.name} had ${todayConversations.length} conversation(s) with ${totalMessages} messages today. Great engagement!`,
            priority: 'normal'
          });
        }
      }
    } catch (error) {
      console.error('Error generating daily summary:', error);
    }
  }
}

export const milestoneService = new MilestoneService();