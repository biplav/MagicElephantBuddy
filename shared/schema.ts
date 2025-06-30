import { pgTable, text, serial, integer, boolean, timestamp, json, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Parent/User schema for authentication and profile management
export const parents = pgTable("parents", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Child profiles managed by parents
export const children = pgTable("children", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => parents.id),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  profile: json("profile").notNull(), // Stores the child profile data
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conversation sessions between child and Appu
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").notNull().references(() => children.id),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration"), // in seconds
  totalMessages: integer("total_messages").default(0).notNull(),
});

// Individual messages within conversations
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  type: text("type").notNull(), // 'child_input', 'appu_response'
  content: text("content").notNull(),
  transcription: text("transcription"), // For audio inputs
  audioPath: text("audio_path"), // Path to audio file if applicable
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  metadata: json("metadata"), // Additional data like emotion, context, etc.
});

// Analytics and insights for parent dashboard
export const conversationInsights = pgTable("conversation_insights", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  summary: text("summary").default('').notNull(), // Brief summary of the conversation
  emotionalTone: text("emotional_tone"), // happy, sad, excited, etc.
  topics: text("topics").array(), // Topics discussed
  learningGoalsAddressed: text("learning_goals_addressed").array(),
  parentalRecommendations: text("parental_recommendations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Learning milestones tracking
export const learningMilestones = pgTable("learning_milestones", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").notNull().references(() => children.id),
  milestoneType: text("milestone_type").notNull(), // 'counting', 'alphabet', 'colors', 'shapes', 'vocabulary', 'social_skills'
  milestoneDescription: text("milestone_description").notNull(),
  targetValue: integer("target_value"), // e.g., 20 for counting to 20
  currentProgress: integer("current_progress").default(0).notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notifications for parents
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => parents.id),
  childId: integer("child_id").references(() => children.id),
  milestoneId: integer("milestone_id").references(() => learningMilestones.id),
  type: text("type").notNull(), // 'milestone_achieved', 'progress_update', 'encouragement', 'daily_summary'
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  priority: text("priority").default('normal').notNull(), // 'low', 'normal', 'high'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notification preferences for parents
export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => parents.id),
  milestoneNotifications: boolean("milestone_notifications").default(true).notNull(),
  progressUpdates: boolean("progress_updates").default(true).notNull(),
  dailySummaries: boolean("daily_summaries").default(true).notNull(),
  encouragementMessages: boolean("encouragement_messages").default(true).notNull(),
  notificationFrequency: text("notification_frequency").default('immediate').notNull(), // 'immediate', 'daily', 'weekly'
  quietHoursStart: text("quiet_hours_start").default('20:00'), // Format: HH:mm
  quietHoursEnd: text("quiet_hours_end").default('08:00'), // Format: HH:mm
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Profile update suggestions from conversation analysis
export const profileUpdateSuggestions = pgTable("profile_update_suggestions", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").notNull().references(() => children.id),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  suggestions: json("suggestions").notNull(), // Array of ProfileSuggestion objects
  status: text("status").default('pending').notNull(), // 'pending', 'approved', 'rejected'
  parentResponse: json("parent_response"), // Which suggestions were approved/rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

// Relations
export const parentsRelations = relations(parents, ({ many }) => ({
  children: many(children),
  notifications: many(notifications),
  notificationPreferences: many(notificationPreferences),
}));

export const childrenRelations = relations(children, ({ one, many }) => ({
  parent: one(parents, {
    fields: [children.parentId],
    references: [parents.id],
  }),
  conversations: many(conversations),
  learningMilestones: many(learningMilestones),
  profileUpdateSuggestions: many(profileUpdateSuggestions),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  child: one(children, {
    fields: [conversations.childId],
    references: [children.id],
  }),
  messages: many(messages),
  insights: many(conversationInsights),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const conversationInsightsRelations = relations(conversationInsights, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationInsights.conversationId],
    references: [conversations.id],
  }),
}));

export const learningMilestonesRelations = relations(learningMilestones, ({ one, many }) => ({
  child: one(children, {
    fields: [learningMilestones.childId],
    references: [children.id],
  }),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  parent: one(parents, {
    fields: [notifications.parentId],
    references: [parents.id],
  }),
  child: one(children, {
    fields: [notifications.childId],
    references: [children.id],
  }),
  milestone: one(learningMilestones, {
    fields: [notifications.milestoneId],
    references: [learningMilestones.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  parent: one(parents, {
    fields: [notificationPreferences.parentId],
    references: [parents.id],
  }),
}));

export const profileUpdateSuggestionsRelations = relations(profileUpdateSuggestions, ({ one }) => ({
  child: one(children, {
    fields: [profileUpdateSuggestions.childId],
    references: [children.id],
  }),
  conversation: one(conversations, {
    fields: [profileUpdateSuggestions.conversationId],
    references: [conversations.id],
  }),
}));

// Insert schemas
export const insertParentSchema = createInsertSchema(parents).pick({
  email: true,
  password: true,
  name: true,
});

export const insertChildSchema = createInsertSchema(children).pick({
  parentId: true,
  name: true,
  age: true,
  profile: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  childId: true,
  startTime: true,
  endTime: true,
  duration: true,
  totalMessages: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  type: true,
  content: true,
  transcription: true,
  audioPath: true,
  metadata: true,
});

export const insertConversationInsightSchema = createInsertSchema(conversationInsights).pick({
  conversationId: true,
  summary: true,
  emotionalTone: true,
  topics: true,
  learningGoalsAddressed: true,
  parentalRecommendations: true,
});

export const insertLearningMilestoneSchema = createInsertSchema(learningMilestones).pick({
  childId: true,
  milestoneType: true,
  milestoneDescription: true,
  targetValue: true,
  currentProgress: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).pick({
  parentId: true,
  childId: true,
  milestoneId: true,
  type: true,
  title: true,
  message: true,
  priority: true,
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).pick({
  parentId: true,
  milestoneNotifications: true,
  progressUpdates: true,
  dailySummaries: true,
  encouragementMessages: true,
  notificationFrequency: true,
  quietHoursStart: true,
  quietHoursEnd: true,
});

export const insertProfileUpdateSuggestionSchema = createInsertSchema(profileUpdateSuggestions).pick({
  childId: true,
  conversationId: true,
  suggestions: true,
  status: true,
  parentResponse: true,
});

// Types
export type InsertParent = z.infer<typeof insertParentSchema>;
export type Parent = typeof parents.$inferSelect;

export type InsertChild = z.infer<typeof insertChildSchema>;
export type Child = typeof children.$inferSelect;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertConversationInsight = z.infer<typeof insertConversationInsightSchema>;
export type ConversationInsight = typeof conversationInsights.$inferSelect;

export type InsertLearningMilestone = z.infer<typeof insertLearningMilestoneSchema>;
export type LearningMilestone = typeof learningMilestones.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;

export type InsertProfileUpdateSuggestion = z.infer<typeof insertProfileUpdateSuggestionSchema>;
export type ProfileUpdateSuggestion = typeof profileUpdateSuggestions.$inferSelect;

// Legacy schemas for backward compatibility
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Memory linking tables for Mem0 integration
export const memoryConversationLinks = pgTable("memory_conversation_links", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  memoryId: text("memory_id").notNull(), // Mem0 memory ID
  relevanceScore: real("relevance_score").default(0.5),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memoryChildContexts = pgTable("memory_child_contexts", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").notNull().references(() => children.id),
  activeMemoryIds: text("active_memory_ids").array(), // Array of Mem0 memory IDs
  contextVector: text("context_vector"), // Serialized context data
  personalityProfile: json("personality_profile"), // PersonalityProfile object
  learningStyle: json("learning_style"), // LearningStyle object
  relationshipLevel: real("relationship_level").default(0),
  activeInterests: text("active_interests").array(),
  emotionalState: text("emotional_state"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const memoryInsights = pgTable("memory_insights", {
  id: serial("id").primaryKey(),
  childId: integer("child_id").notNull().references(() => children.id),
  pattern: text("pattern").notNull(),
  description: text("description").notNull(),
  confidence: real("confidence").default(0.5),
  recommendations: text("recommendations").array(),
  supportingMemoryIds: text("supporting_memory_ids").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true),
});

export const recordings = pgTable("recordings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  recordingDate: timestamp("recording_date").defaultNow().notNull(),
  transcription: text("transcription"),
  response: text("response"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertRecordingSchema = createInsertSchema(recordings).pick({
  userId: true,
  transcription: true,
  response: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type Recording = typeof recordings.$inferSelect;
