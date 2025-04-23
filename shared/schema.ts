import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema for storing user preferences and settings
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Recording history to track user interactions with Appu
export const recordings = pgTable("recordings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  recordingDate: timestamp("recording_date").defaultNow().notNull(),
  transcription: text("transcription"),
  response: text("response"),
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
