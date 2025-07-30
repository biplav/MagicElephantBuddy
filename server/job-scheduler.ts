import { conversationAnalyzer } from "./conversation-analyzer";
import { milestoneService } from "./milestone-service";
import { storage } from "./storage";
import { memoryService } from "./memory-service";
import { createServiceLogger } from './logger';

const jobLogger = createServiceLogger('job-scheduler');

export class JobScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Start the hourly job scheduler
  start(): void {
    if (this.isRunning) {
      jobLogger.info('Job scheduler is already running');
      return;
    }

    jobLogger.info('Starting hourly job scheduler for conversation analysis');

    // Run immediately on startup
    this.runHourlyJobs();

    // Then run every hour (3600000 ms)
    this.intervalId = setInterval(() => {
      this.runHourlyJobs();
    }, 3600000); // 1 hour = 3600000 milliseconds

    this.isRunning = true;
  }

  // Stop the job scheduler
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    jobLogger.info('Job scheduler stopped');
  }

  // Main hourly job execution
  private async runHourlyJobs(): Promise<void> {
    const startTime = new Date();
    jobLogger.info(`Starting hourly jobs at ${startTime.toISOString()}`);

    try {
      // Job 1: Process unanalyzed conversations for summaries and profile suggestions
      await this.processUnanalyzedConversations();

      // Job 2: Generate daily summaries for parents (if it's the end of day)
      await this.generateDailySummaries();

      // Job 3: Generate encouragement notifications for children with low activity
      await this.generateEncouragementNotifications();

      // Job 4: Memory consolidation for all children (Phase 3)
      await this.consolidateMemoriesForAllChildren();

      // Job 5: Auto-close inactive conversations
      await this.autoCloseInactiveConversations();

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      jobLogger.info(`Hourly jobs completed in ${duration}ms at ${endTime.toISOString()}`);
    } catch (error) {
      jobLogger.error('Error running hourly jobs:', error);
    }
  }

  // Process conversations that haven't been analyzed yet
  private async processUnanalyzedConversations(): Promise<void> {
    try {
      jobLogger.info('Processing unanalyzed conversations...');
      await conversationAnalyzer.processUnanalyzedConversations();
    } catch (error) {
      jobLogger.error('Error processing unanalyzed conversations:', error);
    }
  }

  // Generate daily summaries for parents
  private async generateDailySummaries(): Promise<void> {
    try {
      // Check if it's evening (between 19:00 and 21:00) to send daily summaries
      const currentHour = new Date().getHours();
      if (currentHour >= 19 && currentHour <= 21) {
        jobLogger.info('Generating daily summaries for parents...');

        // Get all parents and generate summaries
        const parents = await this.getAllParents();
        for (const parent of parents) {
          await milestoneService.generateDailySummary(parent.id);
          // Add delay to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      jobLogger.error('Error generating daily summaries:', error);
    }
  }

  // Generate encouragement notifications for inactive children
  private async generateEncouragementNotifications(): Promise<void> {
    try {
      // Only run encouragement notifications twice a day (morning and evening)
      const currentHour = new Date().getHours();
      if (currentHour === 9 || currentHour === 18) {
        jobLogger.info('Generating encouragement notifications...');

        const children = await this.getAllChildren();
        for (const child of children) {
          // Check if child hasn't had conversations in the last 2 days
          const recentConversations = await storage.getConversationsByChild(child.id, 3);
          const twoDaysAgo = new Date();
          twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

          const hasRecentActivity = recentConversations.some(conv => 
            new Date(conv.startTime) > twoDaysAgo
          );

          if (!hasRecentActivity) {
            await milestoneService.generateEncouragementNotification(child.id);
          }
        }
      }
    } catch (error) {
      jobLogger.error('Error generating encouragement notifications:', error);
    }
  }

  // Helper method to get all parents
  private async getAllParents() {
    try {
      // This is a simplified query - in practice you might want to add pagination
      const { db } = await import('./db');
      const { parents } = await import('@shared/schema');
      const result = await db.select().from(parents).limit(100);
      return result;
    } catch (error) {
      jobLogger.error('Error fetching parents:', error);
      return [];
    }
  }

  // Helper method to get all children
  private async getAllChildren() {
    try {
      // This is a simplified query - in practice you might want to add pagination
      const { db } = await import('./db');
      const { children } = await import('@shared/schema');
      const result = await db.select().from(children).limit(100);
      return result;
    } catch (error) {
      jobLogger.error('Error fetching children:', error);
      return [];
    }
  }

  // Phase 3: Memory consolidation for all children
  private async consolidateMemoriesForAllChildren(): Promise<void> {
    try {
      jobLogger.info('Starting memory consolidation for all children...');

      const children = await this.getAllChildren();
      let totalConsolidations = 0;
      let totalProcessingTime = 0;

      for (const child of children) {
        try {
          const result = await memoryService.consolidateMemories(child.id);
          totalConsolidations++;
          totalProcessingTime += result.processingTime;

          if (result.consolidatedMemories > 0 || result.mergedMemories > 0 || result.archivedMemories > 0) {
            jobLogger.info(`Memory consolidation for child ${child.id}: ${result.consolidatedMemories} processed, ${result.mergedMemories} merged, ${result.archivedMemories} archived`);
          }
        } catch (error) {
          jobLogger.error(`Error consolidating memories for child ${child.id}:`, error);
        }
      }

      if (children.length > 0) {
        const avgProcessingTime = totalProcessingTime / children.length;
        jobLogger.info(`Memory consolidation completed for ${children.length} children (avg: ${avgProcessingTime.toFixed(2)}ms per child)`);
      } else {
        jobLogger.info('No children found for memory consolidation');
      }
    } catch (error) {
      jobLogger.error('Error during memory consolidation job:', error);
    }
  }

  // Manual trigger for testing
  async runJobsManually(): Promise<void> {
    jobLogger.info('Manually triggering hourly jobs...');
    await this.runHourlyJobs();
  }

  // Auto-close conversations that have been inactive for 30+ minutes
  private async autoCloseInactiveConversations(): Promise<void> {
    try {
      jobLogger.info('Checking for inactive conversations to auto-close...');

      const { db } = await import('./db');
      const { conversations } = await import('@shared/schema');
      const { isNull, and, lt } = await import('drizzle-orm');

      // Get conversations that are still active (no endTime) and older than 30 minutes
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      const inactiveConversations = await db
        .select()
        .from(conversations)
        .where(
          and(
            isNull(conversations.endTime), // Still active (no end time)
            lt(conversations.startTime, thirtyMinutesAgo) // Started more than 30 mins ago
          )
        );

      if (inactiveConversations.length === 0) {
        jobLogger.info('No inactive conversations found to auto-close');
        return;
      }

      jobLogger.info(`Found ${inactiveConversations.length} inactive conversations to auto-close`);

      for (const conversation of inactiveConversations) {
        try {
          const endTime = new Date();
          const duration = Math.floor(
            (endTime.getTime() - new Date(conversation.startTime).getTime()) / 1000
          );

          // Update conversation with end time and duration
          const { storage } = await import('./storage');
          await storage.updateConversation(conversation.id, {
            endTime,
            duration,
            totalMessages: conversation.totalMessages,
          });

          jobLogger.info(
            `Auto-closed inactive conversation ${conversation.id} for child ${conversation.childId} - Duration: ${duration}s`
          );
        } catch (error) {
          jobLogger.error(`Error auto-closing conversation ${conversation.id}:`, error);
        }
      }

      jobLogger.info(`Auto-closed ${inactiveConversations.length} inactive conversations`);
    } catch (error) {
      jobLogger.error('Error during auto-close inactive conversations job:', error);
    }
  }

  // Get job status
  getStatus(): { isRunning: boolean; nextRun?: Date } {
    const nextRun = this.isRunning ? new Date(Date.now() + 3600000) : undefined;
    return {
      isRunning: this.isRunning,
      nextRun
    };
  }
}

export const jobScheduler = new JobScheduler();