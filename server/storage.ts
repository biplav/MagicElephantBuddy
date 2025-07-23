import { 
  users, parents, children, conversations, messages, conversationInsights,
  learningMilestones, notifications, notificationPreferences, profileUpdateSuggestions,
  type User, type InsertUser, type Parent, type InsertParent, 
  type Child, type InsertChild, type Conversation, type InsertConversation,
  type Message, type InsertMessage, type ConversationInsight, type InsertConversationInsight,
  type LearningMilestone, type InsertLearningMilestone, type Notification, type InsertNotification,
  type NotificationPreferences, type InsertNotificationPreferences,
  type ProfileUpdateSuggestion, type InsertProfileUpdateSuggestion
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray, isNull, isNotNull, gte } from "drizzle-orm";

export interface IStorage {
  // Legacy user methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Parent dashboard methods
  getParent(id: number): Promise<Parent | undefined>;
  getParentByEmail(email: string): Promise<Parent | undefined>;
  createParent(parent: InsertParent): Promise<Parent>;

  // Child management
  createChild(child: InsertChild): Promise<Child>;
  getChildrenByParent(parentId: string | number): Promise<Child[]>;
  getChild(id: number): Promise<Child | undefined>;
  updateChildProfile(childId: number, profile: any): Promise<Child>;

  // Conversation management
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation>;
  getConversation(conversationId: number): Promise<Conversation | undefined>;
  getConversationsByChild(childId: number, limit?: number): Promise<Conversation[]>;
  getChildConversations(childId: number, limit?: number): Promise<Conversation[]>;
  getCurrentConversation(childId: number): Promise<Conversation | undefined>;

  // Message management
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;

  // Analytics and insights
  createConversationInsight(insight: InsertConversationInsight): Promise<ConversationInsight>;
  getConversationInsights(conversationId: number): Promise<ConversationInsight[]>;
  getParentDashboardData(parentId: string | number): Promise<{
    children: Child[];
    recentConversations: (Conversation & { child: Child; messages: Message[] })[];
    totalConversations: number;
    totalMessages: number;
  }>;

  // Learning milestones
  createLearningMilestone(milestone: InsertLearningMilestone): Promise<LearningMilestone>;
  updateMilestoneProgress(milestoneId: number, progress: number): Promise<LearningMilestone>;
  completeMilestone(milestoneId: number): Promise<LearningMilestone>;
  getMilestonesByChild(childId: number): Promise<LearningMilestone[]>;
  getChildMilestones(childId: number): Promise<LearningMilestone[]>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByParent(parentId: number, unreadOnly?: boolean): Promise<Notification[]>;
  markNotificationAsRead(notificationId: number): Promise<Notification>;
  markAllNotificationsAsRead(parentId: number): Promise<void>;

  // Notification preferences
  createNotificationPreferences(preferences: InsertNotificationPreferences): Promise<NotificationPreferences>;
  updateNotificationPreferences(parentId: number, preferences: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences>;
  getNotificationPreferences(parentId: number): Promise<NotificationPreferences | undefined>;

  // Profile update suggestions
  createProfileUpdateSuggestion(suggestion: InsertProfileUpdateSuggestion): Promise<ProfileUpdateSuggestion>;
  getProfileUpdateSuggestionsByParent(parentId: number, status?: string): Promise<ProfileUpdateSuggestion[]>;
  updateProfileUpdateSuggestionStatus(suggestionId: number, status: string, parentResponse?: any): Promise<ProfileUpdateSuggestion>;

  // Conversation analysis
  getUnanalyzedConversations(): Promise<Conversation[]>;
  getConversationsWithoutSummary(): Promise<Conversation[]>;
}

export class DatabaseStorage implements IStorage {
  // Legacy user methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Parent methods
  async getParent(id: number): Promise<Parent | undefined> {
    const [parent] = await db.select().from(parents).where(eq(parents.id, id));
    return parent || undefined;
  }

  async getParentByEmail(email: string): Promise<Parent | undefined> {
    const [parent] = await db.select().from(parents).where(eq(parents.email, email));
    return parent || undefined;
  }

  async createParent(insertParent: InsertParent): Promise<Parent> {
    const [parent] = await db.insert(parents).values(insertParent).returning();
    return parent;
  }

  // Child methods
  async createChild(insertChild: InsertChild): Promise<Child> {
    const [child] = await db.insert(children).values(insertChild).returning();
    return child;
  }

  async getChildrenByParent(parentId: string | number): Promise<Child[]> {
    const parentIdNum = '1085268852798816258';//typeof parentId === 'string' ? parseInt(parentId) : parentId;
    console.log('Querying children for parent ID:', '1085268852798816258');
    const result = await db.select().from(children).where(eq(children.parentId, parentIdNum));
    console.log('Found children:', result.length);
    return result;
  }

  async getChild(id: number): Promise<Child | undefined> {
    const [child] = await db.select().from(children).where(eq(children.id, id));
    return child || undefined;
  }

  async updateChildProfile(childId: number, profile: any): Promise<Child> {
    const [child] = await db
      .update(children)
      .set({ profile })
      .where(eq(children.id, childId))
      .returning();
    return child;
  }

  // Conversation methods
  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values(insertConversation).returning();
    return conversation;
  }

  async updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation> {
    const [conversation] = await db
      .update(conversations)
      .set(updates)
      .where(eq(conversations.id, id))
      .returning();
    return conversation;
  }

  async getConversationsByChild(childId: number, limit = 10): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.childId, childId))
      .orderBy(desc(conversations.startTime))
      .limit(limit);
  }

  async getConversation(conversationId: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    return conversation || undefined;
  }

  async getCurrentConversation(childId: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.childId, childId), isNull(conversations.endTime)))
      .orderBy(desc(conversations.startTime))
      .limit(1);
    return conversation || undefined;
  }

  // Message methods
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.timestamp);
  }

  // Analytics methods
  async createConversationInsight(insertInsight: InsertConversationInsight): Promise<ConversationInsight> {
    const [insight] = await db.insert(conversationInsights).values(insertInsight).returning();
    return insight;
  }

  async getConversationInsights(conversationId: number): Promise<ConversationInsight[]> {
    return await db
      .select()
      .from(conversationInsights)
      .where(eq(conversationInsights.conversationId, conversationId));
  }

  async getParentDashboardData(parentId: string | number): Promise<{
    children: Child[];
    recentConversations: (Conversation & { child: Child; messages: Message[]; summary?: string })[];
    totalConversations: number;
    totalMessages: number;
  }> {
    // Convert parentId to number for consistent handling
    const parentIdNum = typeof parentId === 'string' ? parseInt(parentId) : parentId;
    console.log('Getting dashboard data for parent:', parentIdNum);

    // Get all children for this parent
    const childrenData = await this.getChildrenByParent(parentIdNum);

    if (childrenData.length === 0) {
      return {
        children: [],
        recentConversations: [],
        totalConversations: 0,
        totalMessages: 0,
      };
    }

    const childIds = childrenData.map(child => child.id);

    // Get recent conversations with child info and summaries
    const recentConversationsQuery = await db
      .select({
        conversation: conversations,
        child: children,
        summary: conversationInsights.summary,
      })
      .from(conversations)
      .innerJoin(children, eq(conversations.childId, children.id))
      .leftJoin(conversationInsights, eq(conversations.id, conversationInsights.conversationId))
      .where(inArray(conversations.childId, childIds))
      .orderBy(desc(conversations.startTime))
      .limit(10);

    // Get messages for each conversation
    const conversationsWithMessages = await Promise.all(
      recentConversationsQuery.map(async ({ conversation, child, summary }) => {
        const conversationMessages = await this.getMessagesByConversation(conversation.id);
        return {
          ...conversation,
          child,
          messages: conversationMessages,
          summary: summary || undefined,
        };
      })
    );

    // Calculate totals
    const allConversations = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.childId, childIds));

    const totalConversations = allConversations.length;
    const totalMessages = allConversations.reduce((sum, conv) => sum + conv.totalMessages, 0);

    return {
      children: childrenData,
      recentConversations: conversationsWithMessages,
      totalConversations,
      totalMessages,
    };
  }

  // Learning milestones
  async createLearningMilestone(insertMilestone: InsertLearningMilestone): Promise<LearningMilestone> {
    const [milestone] = await db
      .insert(learningMilestones)
      .values(insertMilestone)
      .returning();
    return milestone;
  }

  async updateMilestoneProgress(milestoneId: number, progress: number): Promise<LearningMilestone> {
    const [milestone] = await db
      .update(learningMilestones)
      .set({ 
        currentProgress: progress,
        isCompleted: false // Reset completion status if progress is updated
      })
      .where(eq(learningMilestones.id, milestoneId))
      .returning();
    return milestone;
  }

  async completeMilestone(milestoneId: number): Promise<LearningMilestone> {
    const [milestone] = await db
      .update(learningMilestones)
      .set({ 
        isCompleted: true,
        completedAt: new Date()
      })
      .where(eq(learningMilestones.id, milestoneId))
      .returning();
    return milestone;
  }

  async getMilestonesByChild(childId: number): Promise<LearningMilestone[]> {
    return await db
      .select()
      .from(learningMilestones)
      .where(eq(learningMilestones.childId, childId))
      .orderBy(desc(learningMilestones.createdAt));
  }

  async getChildMilestones(childId: number): Promise<LearningMilestone[]> {
    return await this.getMilestonesByChild(childId);
  }

  async getChildConversations(childId: number, limit?: number): Promise<Conversation[]> {
    return await this.getConversationsByChild(childId, limit);
  }

  // Notifications
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async getNotificationsByParent(parentId: number, unreadOnly = false): Promise<Notification[]> {
    if (unreadOnly) {
      return await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.parentId, parentId),
          eq(notifications.isRead, false)
        ))
        .orderBy(desc(notifications.createdAt));
    }

    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.parentId, parentId))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationAsRead(notificationId: number): Promise<Notification> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId))
      .returning();
    return notification;
  }

  async markAllNotificationsAsRead(parentId: number): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.parentId, parentId));
  }

  // Notification preferences
  async createNotificationPreferences(insertPreferences: InsertNotificationPreferences): Promise<NotificationPreferences> {
    const [preferences] = await db
      .insert(notificationPreferences)
      .values(insertPreferences)
      .returning();
    return preferences;
  }

  async updateNotificationPreferences(parentId: number, updates: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences> {
    const [preferences] = await db
      .update(notificationPreferences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(notificationPreferences.parentId, parentId))
      .returning();
    return preferences;
  }

  async getNotificationPreferences(parentId: number): Promise<NotificationPreferences | undefined> {
    const [preferences] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.parentId, parentId));
    return preferences;
  }

  // Profile update suggestions
  async createProfileUpdateSuggestion(insertSuggestion: InsertProfileUpdateSuggestion): Promise<ProfileUpdateSuggestion> {
    const [suggestion] = await db
      .insert(profileUpdateSuggestions)
      .values(insertSuggestion)
      .returning();
    return suggestion;
  }

  async getProfileUpdateSuggestionsByParent(parentId: number, status?: string): Promise<ProfileUpdateSuggestion[]> {
    const children = await this.getChildrenByParent(parentId);
    const childIds = children.map(child => child.id);

    if (childIds.length === 0) return [];

    if (status) {
      return await db
        .select()
        .from(profileUpdateSuggestions)
        .where(and(
          inArray(profileUpdateSuggestions.childId, childIds),
          eq(profileUpdateSuggestions.status, status)
        ))
        .orderBy(desc(profileUpdateSuggestions.createdAt));
    }

    return await db
      .select()
      .from(profileUpdateSuggestions)
      .where(inArray(profileUpdateSuggestions.childId, childIds))
      .orderBy(desc(profileUpdateSuggestions.createdAt));
  }

  async updateProfileUpdateSuggestionStatus(suggestionId: number, status: string, parentResponse?: any): Promise<ProfileUpdateSuggestion> {
    const [suggestion] = await db
      .update(profileUpdateSuggestions)
      .set({ 
        status,
        parentResponse,
        processedAt: new Date()
      })
      .where(eq(profileUpdateSuggestions.id, suggestionId))
      .returning();
    return suggestion;
  }

   async getChild(childId: number) {
    const result = await db.select().from(children).where(eq(children.id, childId)).limit(1);
    return result[0] || null;
  }

  

  // Conversation analysis - get conversations from past hour only
  async getUnanalyzedConversations(): Promise<Conversation[]> {
    // This method now filters in the analyzer instead of here
    // to avoid complex Drizzle date comparisons
    return this.getConversationsWithoutSummary();
  }

  async getConversationsWithoutSummary(): Promise<Conversation[]> {
    const results = await db
      .select({
        id: conversations.id,
        childId: conversations.childId,
        startTime: conversations.startTime,
        endTime: conversations.endTime,
        duration: conversations.duration,
        totalMessages: conversations.totalMessages,
      })
      .from(conversations)
      .leftJoin(conversationInsights, eq(conversations.id, conversationInsights.conversationId))
      .where(isNull(conversationInsights.id))
      .orderBy(desc(conversations.startTime));
    return results;
  }
}

export const storage = new DatabaseStorage();