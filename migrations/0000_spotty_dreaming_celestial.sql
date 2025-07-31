
CREATE TABLE IF NOT EXISTS "children" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer NOT NULL,
	"name" text NOT NULL,
	"age" integer NOT NULL,
	"profile" json NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"emotional_tone" text,
	"topics" text[],
	"learning_goals_addressed" text[],
	"parental_recommendations" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"start_time" timestamp DEFAULT now() NOT NULL,
	"end_time" timestamp,
	"duration" integer,
	"total_messages" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"milestone_type" text NOT NULL,
	"milestone_description" text NOT NULL,
	"target_value" integer,
	"current_progress" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"transcription" text,
	"audio_path" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer NOT NULL,
	"milestone_notifications" boolean DEFAULT true NOT NULL,
	"progress_updates" boolean DEFAULT true NOT NULL,
	"daily_summaries" boolean DEFAULT true NOT NULL,
	"encouragement_messages" boolean DEFAULT true NOT NULL,
	"notification_frequency" text DEFAULT 'immediate' NOT NULL,
	"quiet_hours_start" text DEFAULT '20:00',
	"quiet_hours_end" text DEFAULT '08:00',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer NOT NULL,
	"child_id" integer,
	"milestone_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parents" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_update_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"suggestions" json NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"parent_response" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recordings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"recording_date" timestamp DEFAULT now() NOT NULL,
	"transcription" text,
	"response" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL
);
--> statement-breakpoint

-- Add unique constraints only if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'parents_email_unique'
        AND table_name = 'parents'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "parents" ADD CONSTRAINT "parents_email_unique" UNIQUE("email");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Unique constraint parents_email_unique already exists, skipping...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_username_unique'
        AND table_name = 'users'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Unique constraint users_username_unique already exists, skipping...';
END $$;

-- Add foreign key constraints only if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'children_parent_id_parents_id_fk'
        AND table_name = 'children'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_parents_id_fk" 
        FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint children_parent_id_parents_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'conversation_insights_conversation_id_conversations_id_fk'
        AND table_name = 'conversation_insights'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_conversation_id_conversations_id_fk" 
        FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint conversation_insights_conversation_id_conversations_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'conversations_child_id_children_id_fk'
        AND table_name = 'conversations'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "conversations" ADD CONSTRAINT "conversations_child_id_children_id_fk" 
        FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint conversations_child_id_children_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'learning_milestones_child_id_children_id_fk'
        AND table_name = 'learning_milestones'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "learning_milestones" ADD CONSTRAINT "learning_milestones_child_id_children_id_fk" 
        FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint learning_milestones_child_id_children_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'messages_conversation_id_conversations_id_fk'
        AND table_name = 'messages'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" 
        FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint messages_conversation_id_conversations_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'notification_preferences_parent_id_parents_id_fk'
        AND table_name = 'notification_preferences'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_parent_id_parents_id_fk" 
        FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint notification_preferences_parent_id_parents_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'notifications_parent_id_parents_id_fk'
        AND table_name = 'notifications'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_parent_id_parents_id_fk" 
        FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint notifications_parent_id_parents_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'notifications_child_id_children_id_fk'
        AND table_name = 'notifications'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_child_id_children_id_fk" 
        FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint notifications_child_id_children_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'notifications_milestone_id_learning_milestones_id_fk'
        AND table_name = 'notifications'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_milestone_id_learning_milestones_id_fk" 
        FOREIGN KEY ("milestone_id") REFERENCES "public"."learning_milestones"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint notifications_milestone_id_learning_milestones_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'profile_update_suggestions_child_id_children_id_fk'
        AND table_name = 'profile_update_suggestions'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "profile_update_suggestions" ADD CONSTRAINT "profile_update_suggestions_child_id_children_id_fk" 
        FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint profile_update_suggestions_child_id_children_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'profile_update_suggestions_conversation_id_conversations_id_fk'
        AND table_name = 'profile_update_suggestions'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "profile_update_suggestions" ADD CONSTRAINT "profile_update_suggestions_conversation_id_conversations_id_fk" 
        FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint profile_update_suggestions_conversation_id_conversations_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'recordings_user_id_users_id_fk'
        AND table_name = 'recordings'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "recordings" ADD CONSTRAINT "recordings_user_id_users_id_fk" 
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint recordings_user_id_users_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;
