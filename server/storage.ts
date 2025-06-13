import { 
  users, parents, children, conversations, messages, conversationInsights,
  type User, type InsertUser, type Parent, type InsertParent, 
  type Child, type InsertChild, type Conversation, type InsertConversation,
  type Message, type InsertMessage, type ConversationInsight, type InsertConversationInsight
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray, isNull } from "drizzle-orm";

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
  getChildrenByParent(parentId: number): Promise<Child[]>;
  getChild(id: number): Promise<Child | undefined>;
  updateChildProfile(childId: number, profile: any): Promise<Child>;
  
  // Conversation management
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation>;
  getConversationsByChild(childId: number, limit?: number): Promise<Conversation[]>;
  getCurrentConversation(childId: number): Promise<Conversation | undefined>;
  
  // Message management
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  
  // Analytics and insights
  createConversationInsight(insight: InsertConversationInsight): Promise<ConversationInsight>;
  getConversationInsights(conversationId: number): Promise<ConversationInsight[]>;
  getParentDashboardData(parentId: number): Promise<{
    children: Child[];
    recentConversations: (Conversation & { child: Child; messages: Message[] })[];
    totalConversations: number;
    totalMessages: number;
  }>;
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

  async getChildrenByParent(parentId: number): Promise<Child[]> {
    return await db.select().from(children).where(eq(children.parentId, parentId));
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

  async getCurrentConversation(childId: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.childId, childId), conversations.endTime.isNull()))
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

  async getParentDashboardData(parentId: number): Promise<{
    children: Child[];
    recentConversations: (Conversation & { child: Child; messages: Message[] })[];
    totalConversations: number;
    totalMessages: number;
  }> {
    // Get all children for this parent
    const childrenData = await this.getChildrenByParent(parentId);
    
    if (childrenData.length === 0) {
      return {
        children: [],
        recentConversations: [],
        totalConversations: 0,
        totalMessages: 0,
      };
    }

    const childIds = childrenData.map(child => child.id);
    
    // Get recent conversations with child info
    const recentConversationsQuery = await db
      .select({
        conversation: conversations,
        child: children,
      })
      .from(conversations)
      .innerJoin(children, eq(conversations.childId, children.id))
      .where(inArray(conversations.childId, childIds))
      .orderBy(desc(conversations.startTime))
      .limit(10);

    // Get messages for each conversation
    const conversationsWithMessages = await Promise.all(
      recentConversationsQuery.map(async ({ conversation, child }) => {
        const conversationMessages = await this.getMessagesByConversation(conversation.id);
        return {
          ...conversation,
          child,
          messages: conversationMessages,
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
}

export const storage = new DatabaseStorage();
