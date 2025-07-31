
-- Add captured frames table for storing analyzed video frames (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS "captured_frames" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_id" integer NOT NULL,
	"conversation_id" integer,
	"frame_data" text NOT NULL,
	"analysis" text NOT NULL,
	"reason" text,
	"looking_for" text,
	"context" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL
);

-- Add foreign key constraints only if they don't exist (with better error handling)
DO $$ 
BEGIN
    -- Add child_id foreign key constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'captured_frames_child_id_children_id_fk'
        AND table_name = 'captured_frames'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "captured_frames" ADD CONSTRAINT "captured_frames_child_id_children_id_fk" 
        FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint captured_frames_child_id_children_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

DO $$ 
BEGIN
    -- Add conversation_id foreign key constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'captured_frames_conversation_id_conversations_id_fk'
        AND table_name = 'captured_frames'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE "captured_frames" ADD CONSTRAINT "captured_frames_conversation_id_conversations_id_fk" 
        FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE no action ON UPDATE no action;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Foreign key constraint captured_frames_conversation_id_conversations_id_fk already exists, skipping...';
    WHEN undefined_table THEN 
        RAISE NOTICE 'Referenced table does not exist, skipping foreign key creation...';
END $$;

-- Add indexes for better query performance only if they don't exist
CREATE INDEX IF NOT EXISTS "captured_frames_child_id_timestamp_idx" ON "captured_frames" ("child_id", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "captured_frames_conversation_id_idx" ON "captured_frames" ("conversation_id");
CREATE INDEX IF NOT EXISTS "captured_frames_visible_idx" ON "captured_frames" ("is_visible");
