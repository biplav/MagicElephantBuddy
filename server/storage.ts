import { 
  users, parents, children, conversations, messages, conversationInsights,
  learningMilestones, notifications, notificationPreferences, profileUpdateSuggestions,
  capturedFrames, books, pages,
  type User, type InsertUser, type Parent, type InsertParent, 
  type Child, type InsertChild, type Conversation, type InsertConversation,
  type Message, type InsertMessage, type ConversationInsight, type InsertConversationInsight,
  type LearningMilestone, type InsertLearningMilestone, type Notification, type InsertNotification,
  type NotificationPreferences, type InsertNotificationPreferences,
  type ProfileUpdateSuggestion, type InsertProfileUpdateSuggestion,
  type CapturedFrame, type InsertCapturedFrame, type Book, type InsertBook,
  type Page, type InsertPage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray, isNull, isNotNull, gte } from "drizzle-orm";

export interface IStorage {
  // Legacy user methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Parent dashboard methods
  getParent(id: string | number): Promise<Parent | undefined>;
  getParentByEmail(email: string): Promise<Parent | undefined>;
  createParent(parent: InsertParent): Promise<Parent>;
  getAllParents(): Promise<Parent[]>;

  // Child management
  createChild(child: InsertChild): Promise<Child>;
  getChildrenByParent(parentId: string | number): Promise<Child[]>;
  getChild(id: number): Promise<Child | undefined>;
  updateChildProfile(childId: number, profile: any): Promise<Child>;
  getAllChildren(): Promise<Child[]>;

  // Conversation management
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation>;
  getConversation(conversationId: number): Promise<Conversation | undefined>;
  getConversationsByChild(childId: number, limit?: number): Promise<Conversation[]>;
  getChildConversations(childId: string | number): Promise<Conversation | undefined>;
  getCurrentConversation(childId: string | number): Promise<Conversation | null>;

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

  // Book management
  createBook(book: InsertBook): Promise<Book>;
  getBook(bookId: string): Promise<Book | undefined>;
  getBookByTitle(title: string): Promise<Book | undefined>;
  getBookByTitleAndMetadata(title: string, metadata: any): Promise<Book | undefined>;
  searchBooks(searchTerms: string, ageRange?: string): Promise<Book[]>;
  updateBook(bookId: string, updates: Partial<InsertBook>): Promise<Book>;
  deleteBook(bookId: string): Promise<void>;
  createPage(page: InsertPage): Promise<Page>;
  getPagesByBook(bookId: string): Promise<Page[]>;
  getPageByBookByPageNumber(bookId: string, pageNumber: string): Promise<Page | undefined>;
  deletePagesByBook(bookId: string): Promise<void>;
  getAllBooks(): Promise<Book[]>;

  // Captured frames
  createCapturedFrame(frame: InsertCapturedFrame): Promise<CapturedFrame>;
  getCapturedFramesByChild(childId: number, limit?: number): Promise<CapturedFrame[]>;
  getCapturedFramesByConversation(conversationId: string | number): Promise<CapturedFrame[]>;
  getCapturedFrame(frameId: string | number): Promise<CapturedFrame | undefined>;
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
  async getParent(id: string | number): Promise<Parent | undefined> {
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

  async getAllParents(): Promise<Parent[]> {
    return await db.select().from(parents).orderBy(desc(parents.createdAt));
  }

  // Child methods
  async createChild(insertChild: InsertChild): Promise<Child> {
    const [child] = await db.insert(children).values(insertChild).returning();
    return child;
  }

  async getChildrenByParent(parentId: string | number): Promise<Child[]> {
    const parentIdStr = String(parentId);
    console.log('Querying children for parent ID:', parentIdStr);
    const result = await db.select().from(children).where(eq(children.parentId, parentIdStr));
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

  async getAllChildren(): Promise<Child[]> {
    return await db.select().from(children).where(eq(children.isActive, true));
  }

  // Conversation methods
  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values(insertConversation).returning();
    return conversation;
  }

  async updateConversation(id: number, updates: {
      endTime?: Date;
      duration?: number;
      totalMessages?: number;
      tokensUsed?: number;
    }): Promise<Conversation> {
    const [updatedConversation] = await db
      .update(conversations)
      .set(updates)
      .where(eq(conversations.id, id))
      .returning();

    return updatedConversation;
  }

  async getConversationsByChild(childId: number, limit: number = 10): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.childId, childId))
      .orderBy(desc(conversations.startTime))
      .limit(limit);
  }

  // Get the current active conversation (one without endTime)
  async getCurrentConversation(childId: string | number): Promise<Conversation | null> {
    const result = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.childId, childId),
        isNull(conversations.endTime)
      ))
      .orderBy(desc(conversations.startTime))
      .limit(1);

    return result[0] || null;
  }

  async getConversation(conversationId: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
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
    // Keep parentId as string to avoid precision loss with large numbers
    const parentIdStr = String(parentId);
    console.log('Getting dashboard data for parent:', parentIdStr);

    // Get all children for this parent
    const childrenData = await this.getChildrenByParent(parentIdStr);

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

  async storeProfileUpdateSuggestions(childId: number, conversationId: number, suggestions: any[]): Promise<ProfileUpdateSuggestion> {
    console.log(`💾 Storing profile suggestions for child ${childId}, conversation ${conversationId}`);
    console.log(`📝 Suggestions:`, JSON.stringify(suggestions, null, 2));

    try {
      const [suggestion] = await db
        .insert(profileUpdateSuggestions)
        .values({
          childId,
          conversationId,
          suggestions,
          status: 'pending'
        })
        .returning();

      console.log(`✅ Successfully stored profile suggestions with ID: ${suggestion.id}`);
      return suggestion;
    } catch (error) {
      console.error(`❌ Error storing profile suggestions:`, error);
      throw error;
    }
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

  // Book management methods
  async createBook(insertBook: InsertBook): Promise<Book> {
    const [book] = await db.insert(books).values(insertBook).returning();
    return book;
  }

  async getBook(bookId: string): Promise<Book | undefined> {
    const [book] = await db
      .select()
      .from(books)
      .where(eq(books.id, bookId));
    return book || undefined;
  }

  async getBookByTitle(title: string): Promise<Book | undefined> {
    const [book] = await db
      .select()
      .from(books)
      .where(and(
        eq(books.title, title),
        eq(books.isActive, true)
      ));
    return book || undefined;
  }

  async getBookByTitleAndMetadata(title: string, metadata: any): Promise<Book | undefined> {
    // Simple similarity check based on title
    const existingBooks = await db
      .select()
      .from(books)
      .where(eq(books.title, title));

    return existingBooks[0] || undefined;
  }

  async searchBooks(searchTerms: string, ageRange?: string): Promise<Book[]> {
    // Split search terms into individual words for better matching
    const terms = searchTerms.toLowerCase().split(' ').filter(term => term.length > 1);

    let query = db
      .select()
      .from(books)
      .where(eq(books.isActive, true));

    // If age range is specified, filter by it
    if (ageRange) {
      query = query.where(and(
        eq(books.isActive, true),
        eq(books.ageRange, ageRange)
      ));
    }

    const allBooks = await query.orderBy(desc(books.createdAt));

    // Enhanced matching with scoring
    const matchingBooks = allBooks.map(book => {
      const title = (book.title || '').toLowerCase();
      const author = (book.author || '').toLowerCase();
      const genre = (book.genre || '').toLowerCase();
      const description = (book.description || '').toLowerCase();
      const summary = (book.summary || '').toLowerCase();
      const metadata = JSON.stringify(book.metadata || {}).toLowerCase();

      let score = 0;
      let titleMatches = 0;
      let exactTitleMatch = false;

      // Check for exact title match (highest priority)
      if (title === searchTerms.toLowerCase()) {
        exactTitleMatch = true;
        score += 1000;
      }

      // Check each search term
      terms.forEach(term => {
        // Title matches get highest weight
        if (title.includes(term)) {
          titleMatches++;
          score += 10;
        }
        // Author matches get high weight
        if (author.includes(term)) {
          score += 8;
        }
        // Genre matches get medium weight
        if (genre.includes(term)) {
          score += 6;
        }
        // Description/summary matches get lower weight
        if (description.includes(term) || summary.includes(term)) {
          score += 3;
        }
        // Metadata matches get lowest weight
        if (metadata.includes(term)) {
          score += 1;
        }
      });

      // Bonus for multiple title word matches
      if (titleMatches > 1) {
        score += titleMatches * 5;
      }

      return { ...book, searchScore: score, exactTitleMatch };
    })
    .filter(book => book.searchScore > 0) // Only include books with some match
    .sort((a, b) => {
      // Exact title matches always come first
      if (a.exactTitleMatch && !b.exactTitleMatch) return -1;
      if (!a.exactTitleMatch && b.exactTitleMatch) return 1;

      // Then sort by score
      return b.searchScore - a.searchScore;
    })
    .slice(0, 10) // Limit to top 10 results
    .map(({ searchScore, exactTitleMatch, ...book }) => book); // Remove scoring fields

    return matchingBooks;
  }

  async updateBook(bookId: string, updates: Partial<InsertBook>): Promise<Book> {
    const [book] = await db
      .update(books)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(books.id, bookId))
      .returning();
    return book;
  }

  async createPage(insertPage: InsertPage): Promise<Page> {
    const [page] = await db.insert(pages).values(insertPage).returning();
    return page;
  }

  async getPagesByBook(bookId: string): Promise<Page[]> {
    return await db
      .select()
      .from(pages)
      .where(eq(pages.bookId, bookId))
      .orderBy(pages.pageNumber);
  }


  async getPageByBookByPageNumber(bookId: string, pageNumber: string): Promise<Page | undefined> {
    const [page] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.bookId, bookId), eq(pages.pageNumber, pageNumber)))
      .limit(1);
    return page || undefined;
  }

  async deletePagesByBook(bookId: string): Promise<void> {
    await db.delete(pages).where(eq(pages.bookId, bookId));
  }

  async deleteBook(bookId: string): Promise<void> {
    await db.delete(books).where(eq(books.id, bookId));
  }

  async getAllBooks(): Promise<Book[]> {
    return await db
      .select()
      .from(books)
      .where(eq(books.isActive, true))
      .orderBy(desc(books.createdAt));
  }

  // Captured frames methods
  async createCapturedFrame(insertFrame: InsertCapturedFrame): Promise<CapturedFrame> {
    const [frame] = await db.insert(capturedFrames).values(insertFrame).returning();
    return frame;
  }

  async getCapturedFramesByChild(childId: number, limit: number = 20): Promise<CapturedFrame[]> {
    return await db
      .select()
      .from(capturedFrames)
      .where(and(
        eq(capturedFrames.childId, childId),
        eq(capturedFrames.isVisible, true)
      ))
      .orderBy(desc(capturedFrames.timestamp))
      .limit(limit);
  }

  async getCapturedFramesByConversation(conversationId: string | number): Promise<CapturedFrame[]> {
    return await db
      .select()
      .from(capturedFrames)
      .where(and(
        eq(capturedFrames.conversationId, conversationId),
        eq(capturedFrames.isVisible, true)
      ))
      .orderBy(desc(capturedFrames.timestamp));
  }

  async getCapturedFrame(frameId: string | number): Promise<CapturedFrame | undefined> {
    const [frame] = await db
      .select()
      .from(capturedFrames)
      .where(eq(capturedFrames.id, frameId));
    return frame || undefined;
  }
}

export const storage = new DatabaseStorage();